require('dotenv').config({ path: __dirname + `/env/.env.${process.env.NODE_ENV}` })
require('./app/nft-verification/verification')