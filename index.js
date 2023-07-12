/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {
  Program,
  Wallet,
  AnchorProvider,
} = require('@coral-xyz/anchor');
const {
  Connection,
  PublicKey,
  Keypair,
} = require('@solana/web3.js');
const idl = require('./wallet_tracker.json');

const express = require('express');
const app = express();
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);
app.set('trust proxy', 1);

app.set('port', (process.env.PORT || 5000));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.set('views', __dirname + '/public');

app.get('/', function(request, response) {
  response.render('index.html');
});

app.get('/nfts', async function(request, response) {
  const xKey = process.env.API_KEY;
  const network = 'mainnet-beta';
  const wallID = request.query.wallet;

  const nftUrl = `https://api.shyft.to/sol/v1/nft/read_all?network=${network}&address=${wallID}`;
  let result = null;
  try {
    const res = await axios({
      // Endpoint to send files
      url: nftUrl,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': xKey,
      },
    });

    result = res.data.result;
  } catch (error) {
    console.error(error);
  }
  if (result) {
    runRecords(wallID, result, response).then((res) => {
      console.log('Recorded');
    });
  } else {
    response.end(JSON.stringify({error: 'Error fetching NFTs in wallet'}, null, 2));
  }
});

app.listen(app.get('port'), function() {
  console.log('Node app is running at localhost:' + app.get('port'));
});

async function runRecords(wallet, result, response) {
  const breadHeads = checkBreadHeads(result);
  console.log('BH: ', breadHeads);
  const babyBreads = checkBabyBreads(result);
  console.log('BB: ', babyBreads);
  response.setHeader('Content-Type', 'application/json');

  let recorded = false;
  let bhi = 0;
  while (!recorded) {
    try {
      if (bhi >= breadHeads.length) {
        break;
      } else {
        const account = await record(new PublicKey(breadHeads[bhi]), 2);
        recorded = true;
        response.end(JSON.stringify(account, null, 2));
      }
    } catch (e) {
      bhi++;
      console.log(e);
    }
  }

  let bbi = 0;
  while (!recorded) {
    try {
      if (bhi >= babyBreads.length) {
        break;
      } else {
        const account = await record(new PublicKey(babyBreads[bbi]), 1);
        recorded = true;
        response.end(JSON.stringify(account, null, 2));
      }
    } catch (e) {
      bbi++;
      console.log(e);
    }
  }

  if (!recorded) {
    try {
      const account = await record(new PublicKey(wallet), 1);
      response.end(JSON.stringify(account, null, 2));
    } catch (e) {
      console.log(e);
      response.end(JSON.stringify({error: 'No eligible NFTs found'}, null, 2));
    }
  }

  return recorded;
}

function checkBreadHeads(nfts) {
  const breadHeads = [];
  for (nft of nfts) {
    // console.log(nft.creators[0]);
    if (nft.creators && nft.creators[0] && nft.creators[0].address == 'BBQ3FjwMm1JSqyNKqa6Qmpw8uyXEXLLVPGtEEqSpWfBd' && nft.creators[0].verified == true) {
      breadHeads.push(nft.mint);
    }
  }
  return breadHeads;
}

function checkBabyBreads(nfts) {
  const babyBreads = [];
  for (nft of nfts) {
    // console.log(nft.creators[0]);
    if (nft.collection && nft.collection.address && nft.collection.verified && nft.collection.address == 'BqxMh57f6oCMEh7iQNrAvcW264wYUYoGrFxo87X18xi7' && nft.collection.verified == true) {
      babyBreads.push(nft.mint);
    }
  }
  return babyBreads;
}

async function record(identifier, entries) {
  console.log('Recording: ', identifier.toString(), ' with ', entries, ' entries');
  const programID = new PublicKey('TRCKTiWtWCzCopm4mnR47n4v2vEvjRQ1q6rsDxRUbVR');
  const connection = new Connection(process.env.RPC_URL, 'confirmed');
  const secret = JSON.parse(process.env.AUTH_KEY);
  const secretKey = Uint8Array.from(secret);
  const authority = Keypair.fromSecretKey(secretKey);

  const provider = new AnchorProvider(connection, new Wallet(authority), {skipPreflight: true, commitment: 'finalized', maxRetries: 100});
  const program = new Program(idl, programID, provider);

  const recordPDA = PublicKey.findProgramAddressSync(
      [Buffer.from('record'), authority.publicKey.toBuffer(), identifier.toBuffer()],
      program.programId,
  );

  console.log('Init signature:', await init(program, identifier, entries, recordPDA[0], authority));

  const account = await program.account.record.fetch(recordPDA[0]);
  console.log(account);

  // await close(program, recordPDA[0], authority);

  return account;
}

async function init(program, identifier, entries, recordPDA, authority) {
  await program.methods
      .initialize(identifier, entries)
      .accounts({
        record: recordPDA,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();
}

// eslint-disable-next-line no-unused-vars
async function close(program, recordPDA, authority) {
  try {
    const tx = await program.methods
        .close()
        .accounts({
          record: recordPDA,
          authority: authority.publicKey,
        })
        .signers([authority])
        .rpc();
    console.log('Close signature:', tx);
  } catch (e) {
    console.log(e);
  }
}
