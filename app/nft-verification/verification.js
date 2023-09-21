
const {
    Client,
    GatewayIntentBits,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { EmbedBuilder } = require('discord.js');
const { XummSdk } = require("xumm-sdk");
const axios = require("axios")
var cron = require('node-cron');

const firebase = require("firebase-admin");
const serviceAccount = require("../../serviceAccountKey.json");
firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
});
const db = firebase.firestore();

const Sdk = new XummSdk(process.env.XUMM_API_KEY, process.env.XUMM_API_SECRET)
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: '10' }).setToken(TOKEN);
const commands = [];

const roles= {
    oneNft:'1059533094849355796',
    fiveNft:'1059533129527853116',
    twentyNft:'1059533137274744852',
    oneUnixNft:'1059533146909069452',
    tenUnixNft:'1059533247043862568',
    noNftsRole:'910842757239672834',
    prefabOwner:'1143477973475917864',
    prefabOwner5:'1143477828361388082',
    landPlotOwner:'1143477758673043487',
    domeOwner:'1143477923945402428',
}

let xpunksNFTs = {}
let unixpunksNFTs = {}
let edenNFTs = {}
let dbUsers = []

const checkDuplicates = async (walletAddress, discordId) => {
    const duplicateWallets = dbUsers.filter(u => u.walletAddress && u.walletAddress.toLowerCase().indexOf(walletAddress.toLowerCase()) !== -1)
    let update = false;
    const batch = db.batch();
    duplicateWallets.forEach(duplicate => {
        if (!discordId || duplicate.discordId !== discordId) {
            const document = db.collection('UserXPUNKnfts').doc(duplicate.discordId)
            let walletAddresses = (duplicate.walletAddress ?? '').split(',')
            walletAddresses = walletAddresses.filter(a => a.toLowerCase() !== duplicate.walletAddress.toLowerCase())
            batch.update(document, { walletAddress: walletAddresses.join(',') });
            update = true;
        }
    });
    if (update) await batch.commit()
}

const mergeDatabases = async () => {
    try {
        const mergeData = await db.collection("UserEdennfts").where('discordId', '!=', null).get()
        const mergeUsers = []
        mergeData.forEach((document) => mergeUsers.push(document.data()))
        
        let update = false
        const batch = db.batch();
        mergeUsers.forEach(userToMerge => {
            const document = db.collection('UserXPUNKnfts').doc(userToMerge.discordId)
            const existingUser = dbUsers.find(u => u.discordId.toLowerCase() === userToMerge.discordId.toLowerCase())
            if (existingUser) {
                let walletAddresses = (existingUser.walletAddress ?? '').split(',')
                if (!walletAddresses.some(wa => wa.toLowerCase() === userToMerge.walletAddress.toLowerCase())) {
                    walletAddresses = walletAddresses.filter(a => a.toLowerCase() !== userToMerge.walletAddress.toLowerCase())
                    walletAddresses.push(userToMerge.walletAddress)
                    if (walletAddresses.length > 1) console.log(existingUser, userToMerge)
                    batch.update(document, { walletAddress: walletAddresses.join(',') });
                    update = true
                }
            } else {
                batch.set(document, { discordId: userToMerge.discordId, walletAddress: userToMerge.walletAddress })
                update = true
            }
        });
        if (update) await batch.commit()
    } catch(err) {
        console.error('Error calling nft API, retrying', err?.message ?? err)
        response = await axios.get(uri, { headers: { 'x-api-key': process.env.XRPLDATA_API_KEY ?? '' } })
        return response?.data?.data
    }
}

const callNFTApi = async (uri) => {
    try {
        let response = await axios.get(uri, { headers: { 'x-api-key': process.env.XRPLDATA_API_KEY ?? '' } })
        if (response.status !== 200) {
            response = await axios.get(uri, { headers: { 'x-api-key': process.env.XRPLDATA_API_KEY ?? '' } })
        }
        return response?.data?.data
    } catch(err) {
        console.error('Error calling nft API, retrying', err?.message ?? err)
        response = await axios.get(uri, { headers: { 'x-api-key': process.env.XRPLDATA_API_KEY ?? '' } })
        return response?.data?.data
    }
}

const loadNFTsAndUsers = async () => {
    const results = await Promise.all([
        (async () => {
            try {
                const xpunksData = await callNFTApi(`https://api.xrpldata.com/api/v1/xls20-nfts/issuer/${process.env.XPUNKS_NFT_ISSUER_ADDRESS}`)
                if (!xpunksData.nfts) throw new Error('No NFTs found')
                xpunksNFTs = xpunksData.nfts.reduce((map, nft) => {
                    const owner = nft.Owner.toLowerCase()
                    if (map[owner]) map[owner].push(nft)
                    else map[owner] = [nft]
                    return map
                }, {})
        
                const unixPunksData = await callNFTApi(`https://api.xrpldata.com/api/v1/xls20-nfts/issuer/${process.env.UNIX_XPUNKS_NFT_ISSUER_ADDRESS}`)
                if (!unixPunksData.nfts) throw new Error('No NFTs found')
                unixpunksNFTs = unixPunksData.nfts.reduce((map, nft) => {
                    const owner = nft.Owner.toLowerCase()
                    if (map[owner]) map[owner].push(nft)
                    else map[owner] = [nft]
                    return map
                }, {})
                return true
            } catch (err) {
                console.error(`Error loading NFTs: ${err?.message ?? err}`)
                return false
            }
        })(),

        (async () => {
            try {
                const edenMPNFTs = await callNFTApi(`https://marketplace-api.onxrp.com/api/nfts-minimal?collection=184224503&attributes=true`)
                if (!edenMPNFTs || edenMPNFTs.length === 0) throw new Error('No NFTs found')

                edenNFTs = edenMPNFTs.reduce((map, nft) => {
                    const owner = nft.owner_wallet_id.toLowerCase()
                    if (!map[owner]) map[owner] = { prefabs: [], plots: [], domes: [] }
                    const ownerNFTs = map[owner]
                    const type = nft.nftAttributes.find(att => att.key === 'Type')?.value
                    if (type === 'Pre-fab') ownerNFTs.prefabs.push(nft)
                    else if (type === 'Land Plot') ownerNFTs.plots.push(nft)
                    else if (type === 'Dome') ownerNFTs.domes.push(nft)
                    return map
                }, {})
                return true
            } catch (err) {
                console.error(`Error loading onxrp Eden NFTs: ${err?.message ?? err}`)
                return false
            }
        })(),

        (async () => {
            try {
                const userData = await db.collection("UserXPUNKnfts").where('discordId', '!=', null).get()
                dbUsers = []
                userData.forEach((document) => dbUsers.push(document.data()))
                return true
            } catch(err) {
                console.error(`Error db users: ${err?.message ?? err}`)
                return false
            }
        })(),
    ])
    return results[0] && results[1] && results[2]
}

const verifyEmbed = new EmbedBuilder()
    .setColor("#ffffff")
    .setTitle('NFT verification Gate')
    .setURL('https://xpunks.club/')
    .setDescription(`**Welcome to The Punkhouse** \n
        To receive full access to the server, you must verify that you are a holder of XPUNKS, Eden, or UNIXPUNKS. Click the Verify button below to get started.\n
        This is a read-only connection. Do not share your private keys. We will never ask for your seed phrase. We will never DM you.`)
    // .setThumbnail('https://onxrp.com/wp-content/uploads/2022/11/Twitter-Bot.png')
    .setThumbnail('https://firebasestorage.googleapis.com/v0/b/onxrp-21175.appspot.com/o/projects%2FEden%2FEden%20Patch.png?alt=media&token=51825218-27f3-43f3-8b5c-6a6e15792c34')
    // .setImage('https://nftimg.onxrp.com/xpunks_banner.png')
    .setTimestamp()
    .setFooter(
        { text: 'Powered by XPUNKS', iconURL: 'https://firebasestorage.googleapis.com/v0/b/onxrp-21175.appspot.com/o/projects%2FXPUNK%2FXFItgsdK_400x400.jpg?alt=media&token=c7c29e39-a086-40b4-927c-089a66f06c6c' }
    );

const checkUserRoles = async (walletAddress, member, log = process.env.NODE_ENV !== 'production') => {
    if (!xpunksNFTs || Object.entries(xpunksNFTs).length === 0 || !unixpunksNFTs || Object.entries(unixpunksNFTs).length === 0) {
        console.error('No NFTs, checkUserRoles failed')
    }

    let walletAddresses = (walletAddress ?? '').split(',');
    let selectedAccountNFT = []
    let selectedAccountUnixNFT = []
    let edenPrefabs = []
    let edenPlots = []
    let edenDomes = []
    
    if (walletAddresses.length > 0) {
        for (const walletAddress of walletAddresses) {
            selectedAccountNFT.push(...(xpunksNFTs[walletAddress?.toLowerCase()] ?? []));
            selectedAccountUnixNFT.push(...(unixpunksNFTs[walletAddress?.toLowerCase()] ?? []));
            const { prefabs, plots, domes } = edenNFTs[walletAddress?.toLowerCase()] ?? { prefabs: [], plots: [], domes: [] }
            edenPrefabs.push(...(prefabs ?? []));
            edenPlots.push(...(plots ?? []));
            edenDomes.push(...(domes ?? []));
        }
    }

    const accountNFTLength = selectedAccountNFT.length;
    const accountNFTUnixLength = selectedAccountUnixNFT.length;
    const accountEdenNFTLength = edenPrefabs.length + edenPlots.length + edenDomes.length
    if (log) console.log('accountNFTLength', accountNFTLength);
    if (log) console.log('accountNFTUnixLength', accountNFTUnixLength);
    if (log) console.log('accountEdenNFTLength', accountEdenNFTLength);
    
    // XPUNKS 
    const hasRoleOneNft = member.roles.cache.has(roles.oneNft);
    const hasRoleFiveNft = member.roles.cache.has(roles.fiveNft);
    const hasRoleTwentyNft = member.roles.cache.has(roles.twentyNft);
    if (accountNFTLength <= 0) {
        if (hasRoleOneNft) await member.roles.remove(roles.oneNft);
        if (hasRoleFiveNft) await member.roles.remove(roles.fiveNft);
        if (hasRoleTwentyNft) await member.roles.remove(roles.twentyNft);
    } else if (accountNFTLength >= 1 && accountNFTLength < 5) {
        if (hasRoleFiveNft) await member.roles.remove(roles.fiveNft);
        if (hasRoleTwentyNft) await member.roles.remove(roles.twentyNft);
        if (!hasRoleOneNft) await member.roles.add(roles.oneNft);
    } else if (accountNFTLength >= 5 && accountNFTLength < 20) {
        if (hasRoleOneNft) await member.roles.remove(roles.oneNft);
        if (hasRoleTwentyNft) await member.roles.remove(roles.twentyNft);
        if (!hasRoleFiveNft) await member.roles.add(roles.fiveNft);
    } else if (accountNFTLength >= 20) {
        if (hasRoleOneNft) await member.roles.remove(roles.oneNft);
        if (hasRoleFiveNft) await member.roles.remove(roles.fiveNft);
        if (!hasRoleTwentyNft) await member.roles.add(roles.twentyNft);
    }

    // UNIX PUNKS
    const hasRoleOneUnixNft = member.roles.cache.has(roles.oneUnixNft);
    const hasRoleTenUnixNft = member.roles.cache.has(roles.tenUnixNft);

    if (accountNFTUnixLength <= 0) {
        if (hasRoleOneUnixNft) await member.roles.remove(roles.oneUnixNft);
        if (hasRoleTenUnixNft) await member.roles.remove(roles.tenUnixNft);
    } else if (accountNFTUnixLength >= 1 && accountNFTUnixLength < 10) {
        if (hasRoleTenUnixNft) await member.roles.remove(roles.tenUnixNft);
        if (!hasRoleOneUnixNft) await member.roles.add(roles.oneUnixNft);
    } else if (accountNFTUnixLength >= 10) {
        if (hasRoleOneUnixNft) await member.roles.remove(roles.oneUnixNft);
        if (!hasRoleTenUnixNft) await member.roles.add(roles.tenUnixNft);
    }

    const hasRoleNoNfts = member.roles.cache.has(roles.noNftsRole);
    if (accountNFTUnixLength <= 0 && accountNFTLength <= 0) {
        if (!hasRoleNoNfts) {
            if (log) console.log("adding no nfts role")
            await member.roles.add(roles.noNftsRole);
        }
    } else {
        if (hasRoleNoNfts) {
            if (log) console.log("removing no nfts role")
            await member.roles.remove(roles.noNftsRole);
        }
    }

    // Eden
    const hasPrefabOwner = member.roles.cache.has(roles.prefabOwner);
    const hasPrefabOwner5 = member.roles.cache.has(roles.prefabOwner5);
    const hasLandPlotOwner = member.roles.cache.has(roles.landPlotOwner);
    const hasDomeOwner = member.roles.cache.has(roles.domeOwner);

    if (edenPrefabs.length > 0 && !hasPrefabOwner) await member.roles.add(roles.prefabOwner);
    else if (edenPrefabs.length === 0 && hasPrefabOwner) await member.roles.remove(roles.prefabOwner);

    if (edenPrefabs.length >= 5 && !hasPrefabOwner5) await member.roles.add(roles.prefabOwner5);
    else if (edenPrefabs.length < 5 && hasPrefabOwner5) await member.roles.remove(roles.prefabOwner5);

    if (edenPlots.length > 0 && !hasLandPlotOwner) await member.roles.add(roles.landPlotOwner);
    else if (edenPlots.length === 0 && hasLandPlotOwner) await member.roles.remove(roles.landPlotOwner);

    if (edenDomes.length > 0 && !hasDomeOwner) await member.roles.add(roles.domeOwner);
    else if (edenDomes.length === 0 && hasDomeOwner) await member.roles.remove(roles.domeOwner);

    return { accountNFTLength, accountNFTUnixLength, accountEdenNFTLength }
}

const checkExistingUsers = async () => {
    try {
        const success = await loadNFTsAndUsers()
        if (!success) {
            console.error("Not checking existing users, failed to load NFTs")
            return
        }

        for (let idx = 0; idx < dbUsers.length; idx = idx + 20) {
            const usersToCheck = dbUsers.slice(idx, idx + 20)
            await Promise.all(usersToCheck.map(async user => {
                try {
                    if (!user.discordId) return;

                    const walletAddress = user.walletAddress;
                    const guild = client.guilds.cache.get(GUILD_ID);
                    const member = await guild.members.fetch(user.discordId);
                    await checkUserRoles(walletAddress, member, process.env.NODE_ENV !== 'production')
                } catch(err) {
                    const message = err?.message ?? err
                    if (message.indexOf('Unknown Member') === -1) {
                        console.error(`Error re-checking ${user.discordId} / ${user.walletAddress}: ${message}`)
                    } else {
                        try {
                            console.log(`Deleting ${user.discordId} / ${user.walletAddress}: ${message}`)
                            await db.collection("UserXPUNKnfts").doc(user.discordId).delete()
                        } catch(delErr) {
                            console.error(`Error re-checking ${user.discordId} / ${user.walletAddress}: ${delErr?.message ?? delErr}`)
                        }
                    }
                }
            }))
        }
    }
    catch (err) {
        console.error(err)
    }
}

const getRolesData = (member, walletAddress) => {
    let walletAddresses = (walletAddress ?? '').split(',');
    let selectedAccountNFT = []
    let selectedAccountUnixNFT = []
    let edenPrefabs = []
    let edenPlots = []
    let edenDomes = []
    
    if (walletAddresses.length > 0) {
        for (const walletAddress of walletAddresses) {
            selectedAccountNFT.push(...(xpunksNFTs[walletAddress?.toLowerCase()] ?? []));
            selectedAccountUnixNFT.push(...(unixpunksNFTs[walletAddress?.toLowerCase()] ?? []));
            const { prefabs, plots, domes } = edenNFTs[walletAddress?.toLowerCase()] ?? { prefabs: [], plots: [], domes: [] }
            edenPrefabs.push(...(prefabs ?? []));
            edenPlots.push(...(plots ?? []));
            edenDomes.push(...(domes ?? []));
        }
    }

    const accountNFTLength = selectedAccountNFT.length;
    const accountNFTUnixLength = selectedAccountUnixNFT.length;
    const accountEdenNFTLength = edenPrefabs.length + edenPlots.length + edenDomes.length

    const hasRoleOneNft = member.roles.cache.has(roles.oneNft);
    const hasRoleFiveNft = member.roles.cache.has(roles.fiveNft);
    const hasRoleTwentyNft = member.roles.cache.has(roles.twentyNft);

    const guild = client.guilds.cache.get(GUILD_ID);
    let roleText = ''
    if (hasRoleOneNft) {
        const role = guild.roles.cache.find((r) => r.id === roles.oneNft);
        roleText += `\n<@&${role.id}> for owning ${accountNFTLength} XPUNK${accountNFTLength > 1 ? 'S' : ''}`;
    } else if (hasRoleFiveNft) {
        const role = guild.roles.cache.find((r) => r.id === roles.fiveNft);
        roleText += `\n<@&${role.id}> for owning ${accountNFTLength} XPUNK${accountNFTLength > 1 ? 'S' : ''}`;
    } else if (hasRoleTwentyNft) {
        const role = guild.roles.cache.find((r) => r.id === roles.twentyNft);
        roleText += `\n<@&${role.id}> for owning ${accountNFTLength} XPUNK${accountNFTLength > 1 ? 'S' : ''}`;
    }

    const hasRoleOneUnixNft = member.roles.cache.has(roles.oneUnixNft);
    const hasRoleTenUnixNft = member.roles.cache.has(roles.tenUnixNft);
    if (hasRoleOneUnixNft) {
        const role = guild.roles.cache.find((r) => r.id === roles.oneUnixNft);
        roleText += `\n<@&${role.id}> for owning ${accountNFTUnixLength} UNIXPUNK${accountNFTUnixLength > 1 ? 'S' : ''}`;
    } else if (hasRoleTenUnixNft) {
        const role = guild.roles.cache.find((r) => r.id === roles.tenUnixNft);
        roleText += `\n<@&${role.id}> for owning ${accountNFTUnixLength} UNIXPUNK${accountNFTUnixLength > 1 ? 'S' : ''}`;
    }

    const hasPrefabOwner = member.roles.cache.has(roles.prefabOwner);
    const hasPrefabOwner5 = member.roles.cache.has(roles.prefabOwner5);
    const hasLandPlotOwner = member.roles.cache.has(roles.landPlotOwner);
    const hasDomeOwner = member.roles.cache.has(roles.domeOwner);
    if (hasPrefabOwner) {
        const role = guild.roles.cache.find((r) => r.id === roles.prefabOwner);
        roleText += `\n<@&${role.id}> for owning ${edenPrefabs.length} Eden Pre-fab${edenPrefabs.length > 1 ? 's' : ''}`;
    }
    if (hasPrefabOwner5) {
        const role = guild.roles.cache.find((r) => r.id === roles.prefabOwner5);
        roleText += `\n<@&${role.id}> for owning ${edenPrefabs.length} Eden Pre-fab${edenPrefabs.length > 1 ? 's' : ''}`;
    }
    if (hasLandPlotOwner) {
        const role = guild.roles.cache.find((r) => r.id === roles.landPlotOwner);
        roleText += `\n<@&${role.id}> for owning ${edenPlots.length} Eden Land Plot${edenPlots.length > 1 ? 's' : ''}`;
    }
    if (hasDomeOwner) {
        const role = guild.roles.cache.find((r) => r.id === roles.domeOwner);
        roleText += `\n<@&${role.id}> for owning ${edenDomes.length} Eden Dome${edenDomes.length > 1 ? 's' : ''}`;
    }
    
    return { roleText, walletAddresses, accountNFTLength, accountNFTUnixLength, accountEdenNFTLength }
}

client.on('ready', async () => {
    console.log('Bot is online, loading NFTs');
    await loadNFTsAndUsers()
    // await mergeDatabases()

    if (process.env.NODE_ENV === 'production') {
        /*************** cron jobs start *********************/
        cron.schedule('*/1 * * * *', async () => {
            await loadNFTsAndUsers()
        });
        cron.schedule('0 */1 * * *', async () => {
            await checkExistingUsers()
        });
        console.log('cronjobs scheduled')
        /*************** cron job end *********************/
    }

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    const message = await channel.messages.fetch()
    if (message.size === 0) {
        console.log('sending verify message')
        channel.send({
            embeds: [verifyEmbed],
            components: [
                new ActionRowBuilder().setComponents(
                    new ButtonBuilder()
                        .setCustomId('success')
                        .setLabel('Verify')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('primary')
                        .setLabel('Check Status')
                        .setStyle(ButtonStyle.Primary)
                ),
            ],
        });
    } else {
        console.log('verify message already send')
    }

    await checkExistingUsers()
    console.log('Checked existing users');
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            await interaction.deferReply({
                ephemeral: true,
            })
            const btnId = interaction.customId;
            if (btnId === 'success') {
                const request = {
                    "TransactionType": "SignIn",
                }

                const subscription = await Sdk.payload.createAndSubscribe(request, async (event) => {
                    if (Object.keys(event.data).indexOf('signed') > -1) {
                        return event.data
                    }
                })
                const qrEmbed = new EmbedBuilder()
                    .setColor("#ffffff")
                    .setTitle("AUTH LINK - Click here for mobile")
                    .setURL(`${subscription.created.next.always}`)
                    .setDescription(`◆ Scan this QR code with your XUMM wallet to verify that you hold XPUNKS, UNIXPUNKS and/or Eden NFTs. This is a read-only transaction. \n
                        ◆ You are able to map multiple wallets. If you want to map another wallet, run the Verify command again.`)
                    .setImage(`${subscription.created.refs.qr_png}`)
                    .setTimestamp()
                    .setFooter(
                        { text: 'Powered by XPUNKS', iconURL: 'https://firebasestorage.googleapis.com/v0/b/onxrp-21175.appspot.com/o/projects%2FXPUNK%2FXFItgsdK_400x400.jpg?alt=media&token=c7c29e39-a086-40b4-927c-089a66f06c6c' }
                    );
                await interaction.editReply({
                    ephemeral: true,
                    embeds: [qrEmbed],
                });
                const resolveData = await subscription.resolved;
                if (resolveData.signed == false) {
                    return interaction.followUp({ content: 'User rejected the request', ephemeral: true });
                } else if (resolveData.signed == true) {
                    const result = await Sdk.payload.get(resolveData.payload_uuidv4)
                    let walletAddress = result.response.account;

                    const userDocument = db.collection("UserXPUNKnfts").doc(interaction.member.user.id);
                    const userData = await userDocument.get()
                    if (userData.exists) {
                        const existingUser = userData.data()
                        await checkDuplicates(walletAddress, existingUser.discordId)

                        let walletAddresses = (existingUser.walletAddress ?? '').split(',')
                        walletAddresses = walletAddresses.filter(a => a.toLowerCase() !== walletAddress.toLowerCase())
                        walletAddresses.push(walletAddress)
                        walletAddress = walletAddresses.join(',')
                    } else {
                        await checkDuplicates(walletAddress)
                    }

                    await userDocument.set({
                        discordId: interaction.member.user.id,
                        walletAddress,
                    });

                    const { accountNFTLength, accountEdenNFTLength, accountNFTUnixLength } = await checkUserRoles(walletAddress, interaction.member, true)

                    if (accountNFTLength == 0 && accountNFTUnixLength == 0 && accountEdenNFTLength == 0) {
                        return interaction.followUp({ content: `No NFTs found`, ephemeral: true });
                    }
                    
                    const guild = client.guilds.cache.get(GUILD_ID);
                    const reloadedMember = await guild.members.fetch(interaction.member.user.id);
                    const { roleText } = getRolesData(reloadedMember, walletAddress)
                    return interaction.followUp({ 
                        content: `Verification successful.\n\nYou have been assigned the following roles: ${roleText}`,
                        ephemeral: true
                    });
                }
            } else if (btnId === 'primary') {
                const discordId = interaction.member.user.id;
                const userDocument = await db.collection("UserXPUNKnfts").doc(discordId).get();
                const userData = userDocument.exists ? userDocument.data() : null

                const { roleText, walletAddresses, accountNFTLength, accountNFTUnixLength, accountEdenNFTLength } = getRolesData(interaction.member, userData ? userData.walletAddress : '')
                const statusEmbed = new EmbedBuilder()
                    .setColor("#ffffff")
                    .setTitle("Verification Status")
                    .setDescription(`◆ **Wallet addresses mapped - ** ${walletAddresses.length > 1 ? '\n' : ''}${walletAddresses.join('\n')}
                        ◆ **Total XPUNKS NFTs - ** ${accountNFTLength}
                        ◆ **Total UNIXPUNKS NFTs - ** ${accountNFTUnixLength}
                        ◆ **Total Eden NFTs - ** ${accountEdenNFTLength}
                        ◆ **You have been assigned the following roles: ** ${roleText} \n`)
                    .setTimestamp()
                return interaction.editReply({ embeds: [statusEmbed], ephemeral: true });

            }
        }
    }
    catch (err) {
        await interaction.followUp({ content: `${err.message}`, ephemeral: true });
        console.error(err);
    }
});

async function main() {
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
            body: commands,
        });
        client.login(TOKEN);
    } catch (err) {
        console.log(err);
    }
}


main();
