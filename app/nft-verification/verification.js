
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

// const userModel = require("./model");

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
}

let xpunksNFTs = {}
let unixpunksNFTs = {}
const loadNFTs = async () => {
    try {
        const xpunksNFTResponse = await axios.get(`https://api.xrpldata.com/api/v1/xls20-nfts/issuer/${process.env.XPUNKS_NFT_ISSUER_ADDRESS}`, {
            headers: { 'x-api-key': process.env.XRPLDATA_API_KEY ?? '' }
        })
        xpunksNFTs = xpunksNFTResponse.status !== 200 ? xpunksNFTs : (xpunksNFTResponse?.data?.data?.nfts ?? []).reduce((map, nft) => {
            const owner = nft.Owner.toLowerCase()
            if (map[owner]) map[owner].push(nft)
            else map[owner] = [nft]
            return map
        }, {})

        const unixpunksNFTResponse = await axios.get(`https://api.xrpldata.com/api/v1/xls20-nfts/issuer/${process.env.UNIX_XPUNKS_NFT_ISSUER_ADDRESS}`, {
            headers: { 'x-api-key': process.env.XRPLDATA_API_KEY ?? '' }
        })
        unixpunksNFTs = unixpunksNFTResponse.status !== 200 ? unixpunksNFTs : (unixpunksNFTResponse?.data?.data?.nfts ?? []).reduce((map, nft) => {
            const owner = nft.Owner.toLowerCase()
            if (map[owner]) map[owner].push(nft)
            else map[owner] = [nft]
            return map
        }, {})
        return true
    } catch (err) {
        console.error(`Error loading NFTs: ${err}`)
        return false
    }
}

const verifyEmbed = new EmbedBuilder()
    .setColor("#ffffff")
    .setTitle('NFT VERIFICATION')
    .setURL('https://xpunks.club/')
    .setDescription('**Verify your assets** \n\n ◆ If you want to gain access to the rest of the server and join us in the Punkhouse, verify your XPUNKS and/or UNIXPUNKS NFTs holdings by completing the verification process with the XUMM app. \n\n ◆ This is a read-only connection. Do not share your private keys. We will never ask for your seed phrase. We will never DM you.')
    .setThumbnail('https://onxrp.com/wp-content/uploads/2022/11/Twitter-Bot.png')
    .setImage('https://xpunks.club/wp-content/uploads/2022/11/Banner-2048x403.png')
    .setTimestamp()
    .setFooter(
        { text: 'Powered by XPUNKS', iconURL: 'https://xpunks.club/wp-content/uploads/2021/10/Kaj-Bradley-Punkhouse.png' }
    );

const checkUserRoles = async (walletAddress, member, log = process.env.NODE_ENV !== 'production') => {
    if (!xpunksNFTs || Object.entries(xpunksNFTs).length === 0 || !unixpunksNFTs || Object.entries(unixpunksNFTs).length === 0) {
        console.error('No NFTs, checkUserRoles failed')
    }

    const selectedAccountNFT = xpunksNFTs[walletAddress?.toLowerCase()] ?? [];
    const selectedAccountUnixNFT = unixpunksNFTs[walletAddress?.toLowerCase()] ?? [];
    const accountNFTLength = selectedAccountNFT.length;
    const accountNFTUnixLength = selectedAccountUnixNFT.length;
    if (log) console.log('accountNFTLength', accountNFTLength);
    if (log) console.log('accountNFTUnixLength', accountNFTUnixLength);
    
    // XPUNKS 
    const hasRoleOneNft = member.roles.cache.has(roles.oneNft);
    const hasRoleFiveNft = member.roles.cache.has(roles.fiveNft);
    const hasRoleTwentyNft = member.roles.cache.has(roles.twentyNft);
    if (walletAddress === null || accountNFTLength <= 0) {
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

    if (walletAddress === null || accountNFTUnixLength <= 0) {
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
    if (walletAddress === null || (accountNFTUnixLength <= 0 && accountNFTLength <= 0)) {
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

    return { accountNFTLength, accountNFTUnixLength }
}

const checkExistingUsers = async () => {
    try {
        const success = await loadNFTs()
        if (!success) {
            console.error("Not checking existing users, failed to load NFTs")
            return
        }

        const userData = await db.collection("UserXPUNKnfts").where('discordId', '!=', null).get()
        const users = []
        userData.forEach((document) => users.push(document.data()))

        for (let idx = 0; idx < users.length; idx = idx + 20) {
            const usersToCheck = users.slice(idx, idx + 20)
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

client.on('ready', async () => {
    console.log('Bot is online, loading NFTs');
    await loadNFTs()

    if (process.env.NODE_ENV === 'production') {
        /*************** cron jobs start *********************/
        cron.schedule('*/1 * * * *', async () => {
            await loadNFTs()
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
                    .setDescription('◆ Scan this QR code with your XUMM wallet to verify that you hold XPUNKS and/or UNIXPUNKS NFTs. This is a read-only transaction. \n\n ◆ The last wallet that you sign with, is used to determine if you are eligible to enter the Punkhouse!')

                    .setImage(`${subscription.created.refs.qr_png}`)
                    .setTimestamp()
                    .setFooter(
                        { text: 'Powered by XPUNKS', iconURL: 'https://xpunks.club/wp-content/uploads/2021/10/Kaj-Bradley-Punkhouse.png' }
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
                    const account = result.response.account;

                    const checkDuplicates = async (walletAddress, discordId) => {
                        const findDuplicateWallet = await db.collection("UserXPUNKnfts").where('walletAddress', '==', walletAddress).get();
                        const update = false;
                        const batch = db.batch();
                        findDuplicateWallet.forEach(document => {
                            const data = document.data()
                            if (!discordId || data.discordId !== discordId) {
                                batch.update(document, { walletAddress: null });
                                update = true;
                            }
                        });
                        if (update) await batch.commit()
                    }

                    const userDocument = db.collection("UserXPUNKnfts").doc(interaction.member.user.id);
                    const userData = await userDocument.get()
                    if (userData.exists) {
                        await checkDuplicates(account, userData.data().discordId)
                    } else {
                        await checkDuplicates(account)
                    }

                    await userDocument.set({
                        discordId: interaction.member.user.id,
                        walletAddress: account,
                    });

                    const { accountNFTLength, accountNFTUnixLength } = await checkUserRoles(account, interaction.member, true)

                    if (accountNFTLength == 0 && accountNFTUnixLength == 0) {
                        return interaction.followUp({ content: `No NFTs found`, ephemeral: true });
                    }
                    return interaction.followUp({ content: `Verification successful`, ephemeral: true });
                }
            } else if (btnId === 'primary') {
                const discordId = interaction.member.user.id;
                const userDocument = await db.collection("UserXPUNKnfts").doc(discordId).get();
                const userData = userDocument.exists ? userDocument.data() : null

                let walletAddress = userData ? userData.walletAddress : 'not set';
                let accountNFTLength = 0;
                let accountNFTUnixLength = 0;
                if (walletAddress && walletAddress !== 'not set') {
                    const selectedAccountNFT = xpunksNFTs[walletAddress?.toLowerCase()] ?? [];
                    const selectedAccountUnixNFT = unixpunksNFTs[walletAddress?.toLowerCase()] ?? [];
                    accountNFTLength = selectedAccountNFT.length;
                    accountNFTUnixLength = selectedAccountUnixNFT.length;
                }

                const hasRoleOneNft = interaction.member.roles.cache.has(roles.oneNft);
                const hasRoleFiveNft = interaction.member.roles.cache.has(roles.fiveNft);
                const hasRoleTwentyNft = interaction.member.roles.cache.has(roles.twentyNft);

                const guild = client.guilds.cache.get(GUILD_ID);
                let roleName = null;
                let roleNameUnix = null;
                if (hasRoleOneNft) {
                    const role = guild.roles.cache.find((r) => r.id === roles.oneNft);
                    roleName = role.name;
                } else if (hasRoleFiveNft) {
                    const role = guild.roles.cache.find((r) => r.id === roles.fiveNft);
                    roleName = role.name;
                } else if (hasRoleTwentyNft) {
                    const role = guild.roles.cache.find((r) => r.id === roles.twentyNft);
                    roleName = role.name;
                }

                const hasRoleOneUnixNft = interaction.member.roles.cache.has(roles.oneUnixNft);
                const hasRoleTenUnixNft = interaction.member.roles.cache.has(roles.tenUnixNft);
                if (hasRoleOneUnixNft) {
                    const role = guild.roles.cache.find((r) => r.id === roles.oneUnixNft);
                    roleNameUnix = role.name;
                } else if (hasRoleTenUnixNft) {
                    const role = guild.roles.cache.find((r) => r.id === roles.tenUnixNft);
                    roleNameUnix = role.name;
                }

                let showRole;
                if (roleName == null && roleNameUnix == null) {
                    showRole = null;
                } else if (roleName == null) {
                    showRole = roleNameUnix;
                } else if (roleNameUnix == null) {
                    showRole = roleName;
                } else {
                    showRole = roleName + ", " + roleNameUnix;
                }

                const statusEmbed = new EmbedBuilder()
                    .setColor("#ffffff")
                    .setTitle("Verification Status")
                    .setDescription(`◆ **Wallet Address - ** ${walletAddress} \n ◆ **Total XPUNKS NFT - ** ${accountNFTLength} \n ◆ **Total UNIXPUNKS NFT - ** ${accountNFTUnixLength} \n ◆ **Role Name - ** ${showRole} \n`)
                    .setTimestamp()
                    .setFooter(
                        { text: 'Powered by XPUNKS', iconURL: 'https://xpunks.club/wp-content/uploads/2021/10/Kaj-Bradley-Punkhouse.png' }
                    );
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
