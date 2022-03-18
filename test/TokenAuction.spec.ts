import chai from "chai";
import config from "./vite.config.json";
const vite = require("@vite/vuilder");
const { accountBlock, utils } = require("@vite/vitejs");

const { createAccountBlock, ReceiveAccountBlockTask } = accountBlock;
const should = chai.should();

const VITE = "tti_5649544520544f4b454e6e40";

describe("TokenAuction", () => {
  let provider;
  let deployer;
  let compiledContracts;
  let auction;
  let alice, bob, carol, dave;

  async function issueTokens(account, amount) {
    var api = provider;

    const { privateKey, address } = account;

    // Workaround to wait for block to get published
    // before fetching list of tokens again
    async function waitForTransaction() {
      const ReceiveTask = new ReceiveAccountBlockTask({
        address: address,
        privateKey: privateKey,
        provider,
      });
      let resolve_, reject_;
      const f = (resolve, reject) => {
        resolve_ = resolve;
        reject_ = reject;
      };
      ReceiveTask.onSuccess((data) => {
        resolve_(data);
      });
      ReceiveTask.onError((err) => {
        reject_(err);
      });

      ReceiveTask.start({
        checkTime: 5000,
        transctionNumber: 10,
      });
      return new Promise(f);
    }

    async function displayBalanceInfo(address_?) {
      const effectiveAddress = address_ || address;
      await api
        .getBalanceInfo(effectiveAddress)
        .then((e) =>
          console.log(
            "Balance info for " + effectiveAddress + " :\n",
            e.balance.balanceInfoMap
          )
        );
    }

    async function findOwnerToken() {
      const tokenInfoList = (
        await api.request("contract_getTokenInfoList", 0, 1000)
      ).tokenInfoList;
      return tokenInfoList.find(
        (e) =>
          e.tokenId !== "tti_5649544520544f4b454e6e40" && e.owner === address
      );
    }

    async function issueToken(amount, decimals) {
      const accBlk = createAccountBlock("issueToken", {
        address,
        tokenName: "Test Token",
        isReIssuable: true,
        maxSupply: amount,
        totalSupply: amount,
        isOwnerBurnOnly: false,
        decimals: decimals,
        tokenSymbol: "TEST",
      })
        .setProvider(api)
        .setPrivateKey(privateKey);
      const result = await accBlk.autoSend();

      console.log(amount, "tokens created:", result);
      console.log("Waiting for confirmation...");
      await waitForTransaction();
    }

    await displayBalanceInfo();

    let token = await findOwnerToken();
    if (!token) {
      await issueToken(amount, 10);
      token = await findOwnerToken();
    }

    console.log("Token:", token);
    return token;
  }

  before(async () => {
    provider = vite.newProvider(config.networks.local.http);
    deployer = vite.newAccount(config.networks.local.mnemonic, 0, provider);
    alice = vite.newAccount(config.networks.local.mnemonic, 1, provider);
    // bob = vite.newAccount(config.networks.local.mnemonic, 2, provider);
    // carol = vite.newAccount(config.networks.local.mnemonic, 3, provider);
    // dave = vite.newAccount(config.networks.local.mnemonic, 4, provider);

    await deployer.sendToken(alice.address, "10000000000000000000000");
    // await deployer.sendToken(bob.address, "10000000000000000000000");
    // await deployer.sendToken(carol.address, "10000000000000000000000");
    // await deployer.sendToken(dave.address, "10000000000000000000000");

    await alice.receiveAll();
    // await bob.receiveAll();
    // await carol.receiveAll();
    // await dave.receiveAll();
  });

  beforeEach(async () => {
    compiledContracts = await vite.compile("TokenAuction.solpp");

    // should exist
    compiledContracts.should.have.property("TokenAuction");

    // should deploy
    auction = compiledContracts.TokenAuction;
    console.log("Auction:", auction);
    auction.setDeployer(deployer).setProvider(provider);
    await auction.deploy({ responseLatency: 1 });
    should.exist(auction.address);
    auction.address.should.be.a("string");
  });

  it("should create auction", async () => {
    let endTime = Date.now() + 60 * 60 * 24 * 1;
    const token = await issueTokens(alice, "10000000000000000");
    await auction.call("createAuction", ["2000000", endTime, "test_auction"], {
      caller: alice,
      amount: "2000000000",
      tokenId: token.tokenId,
    });
    let events;

    // check Received event
    events = await auction.getPastEvents("AuctionCreated", {
      fromHeight: 0,
      toHeight: 0,
    });
    should.exist(events);
    events.should.be.an("array");
    events.should.have.length.greaterThan(0);
    events[0].should.have.property("returnValues");
    events[0].returnValues.should.have.property("_id");
    events[0].returnValues._id.should.be.a("string");
    events[0].returnValues.should.have.property("_tti");
    events[0].returnValues._tti.should.be.a("string");
    should.equal(
      parseInt(events[0].returnValues._tti, 16),
      parseInt(utils.getOriginalTokenIdFromTokenId(token.tokenId), 16)
    );
    should.equal(events[0].returnValues._seller, alice.address);
    should.equal(events[0].returnValues._name, "test_auction");
    should.equal(events[0].returnValues._reservePrice, "2000000");
    should.equal(events[0].returnValues._endTime, endTime.toFixed(0));
    should.equal(events[0].returnValues._numTokens, "2000000000");
  });

  it("should get single auction", async () => {
    let endTime = Date.now() + 60 * 60 * 24 * 1;
    const unitPrice = "2000000";
    const numTokens = "2000000000";
    const token = await issueTokens(alice, numTokens);
    await auction.call("createAuction", [unitPrice, endTime, "test_auction"], {
      caller: alice,
      amount: numTokens,
      tokenId: token?.tokenId,
    });

    // check Received event
    const events = await auction.getPastEvents("AuctionCreated", {
      fromHeight: 0,
      toHeight: 0,
    });

    const auctionId = events[0].returnValues._id;
    const result = await auction.query("getAuction", [auctionId], {
      caller: alice,
    });
    result.should.be.an("array");
    result.should.deep.equal([
      "test_auction",
      alice.address,
      unitPrice,
      endTime.toFixed(0),
      numTokens,
      token.tokenId,
      "0",
    ]);
  });
});
