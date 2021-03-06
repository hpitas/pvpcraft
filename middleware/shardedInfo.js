/**
 * Created by macdja38 on 2016-09-01.
 */
"use strict";

var Utils = require('../lib/utils');
var utils = new Utils();

var request = require('request');

var StandardDB = require('../lib/standardDB');

module.exports = class shardedInfo {
  constructor(e) {
    this._auth = e.auth;
    this._client = e.client;
    this._timer = false;
    this._ready = false;
    this._lastMessage = Date.now();
    this._standardDB = false;
    this._standardDB = new StandardDB("shards", this._getArray(parseInt(process.env.shards || 1)));
    this._ready = this._standardDB.reload();
    this.waitBeforeRestart = e.config.get("waitBeforeRestart", 120) * 1000;
  }

  /**
   * Get's called every time the bot connects, not just the first time.
   */
  onReady() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(this._updateDB.bind(this), 10000);
  }

  _getArray(n) {
    return [...new Array(n).keys()].map(val => val.toString());
  }

  _updateDB() {
    if (Date.now() - this._lastMessage > this.waitBeforeRestart) {
      process.exit(532);
    }
    if (!this._ready || !this._ready.then) return;
    this._ready.then(()=> {
      this._standardDB.set(null,
        {
          servers: this._client.servers.length,
          connections: this._client.voiceConnections.length,
          playing: this._client.voiceConnections.filter(c => c.playing).length,
          users: this._client.users.length,
          shards: parseInt(process.env.shards) || 1,
          lastUpdate: Date.now(),
          lastMessage: this._lastMessage,
        }, {server: process.env.id ? process.env.id : "0"})
    }).catch(error => console.error(error))
  }

  /**
   * Get's called every time the bot disconnects.
   */
  onDisconnect() {
    if (this._timer) clearInterval(this._timer);
  }

  onServerCreated() {
    if (!this._standardDB.data) return;
    let serverData = [];
    for (let key in this._standardDB.data) {
      if (this._standardDB.data.hasOwnProperty(key) && parseInt(key) < parseInt(process.env.shards) || 1) {
        serverData[parseInt(key)] = this._standardDB.data[key]
      }
    }
    let serverCount = serverData.map(s => s.servers).reduce((total, num) => total + num, 0);
    console.log("Server Count", serverCount);
    if (process.uptime() < 60) {
      console.log("Not updating server count websites as bot has not been online for long enough".green);
      return;
    }
    this.updateCarbonitex(serverCount);
    this.updateAbal(serverCount);
  }

  onMessage() {
    this._lastMessage = Date.now();
  }

  updateAbal(servers) {
    let token = this._auth.get("abalKey", false);
    if(token && token.length > 1 && token !== "key") {
      request.post({
        url: `https://bots.discord.pw/api/bots/${this._client.user.id}/stats`,
        headers: { Authorization: token },
        json: { server_count: servers }
      }, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          console.log(body)
        }
        else if (error) {
          console.error(error);
        }
        else {
          console.error("Bad request or other");
          console.error(response.body);
        }
      })
    }
  }

  updateCarbonitex(servers) {
    let token = this._auth.get("key", false);
    if (!token || token === "key") return;
    console.log("Attempting to update Carbon".green);
    if (token) {
      request(
        {
          url: 'https://www.carbonitex.net/discord/data/botdata.php',
          body: { key: token, servercount: servers },
          json: true
        },
        function (error, response, body) {
          if (!error && response.statusCode == 200) {
            console.log(body)
          }
          else if (error) {
            console.error(error);
          }
          else {
            console.error("Bad request or other");
            console.error(response.body);
          }
        }
      )
    }
  }

  /**
   * get's called every Command, (unless a previous middleware on the list override it.) can modify message.
   * @param msg
   * @param command
   * @param perms
   * @param l
   * @returns command || Boolean object (may be modified.)
   */
  changeCommand(msg, command, perms, l) {
    try {
      if (command.command === "getshardedinfo") {
        if (!this._standardDB.data) {
          msg.reply("Sorry db connection not ready yet");
          return true;
        }
        let serverData = [];
        for (let key in this._standardDB.data) {
          if (this._standardDB.data.hasOwnProperty(key) && parseInt(key) < parseInt(process.env.shards) || 1) {
            serverData[parseInt(key)] = this._standardDB.data[key]
          }
        }
        let shardsOnline = serverData.filter(s => Date.now() - s.lastUpdate < 30000).length;
        let shardsReceivingMessages = serverData.filter(s => Date.now() - s.lastMessage < 60000).length;
        let serverCount = serverData.map(s => s.servers).reduce((total, num) => total + num, 0);
        let connections = serverData.map(s => s.connections).reduce((total, num) => total + num, 0);
        let playing = serverData.map(s => s.playing).reduce((total, num) => total + num, 0);
        let users = serverData.map(s => s.users).reduce((total, num) => total + num, 0);
        msg.reply(`\`\`\`xl\nshards online: ${shardsOnline}/${process.env.shards || 1}\nshards connected: ${shardsReceivingMessages}/${process.env.shards || 1}\nservers: ${serverCount}\nconnections: ${connections}\nplaying: ${playing}\nusers: ${users}\n\`\`\``);
        return false;
      }
      return command;
    } catch(error) {
      console.error(error);
      return command;
    }
  }
};