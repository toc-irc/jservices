const DEBUG = false;
const net = require('net');
const fs = require('fs');

const _config = process.argv[2]?process.argv[2]:"services.conf";
var config = {};
if(fs.existsSync(_config)) config = JSON.parse(fs.readFileSync(_config));
else process.exit(1);
if(config.length==0) process.exit(1);

(async function() {
  var connection=net.createConnection(config.port,config.host);
  connection.target=config;
  connection.send = function(d) {
    this.write(d+"\n");
    if(DEBUG) console.log(d);
  };
  connection.users = {};
  connection.uids = {};

  connection.isAuthenticated = -1;

  connection.buffer = '';

  connection.on('connect',function() {
    switch(this.target.protocol) {
      case "TS6":
      default:
        this.send('PASS '+this.target.sendPassword+' TS 6 :'+this.target.mySID);
        this.send('SERVER '+this.target.myName+' 1 :'+this.target.myDesc);
        break;
    }
  });
  connection.on('data',function(data) {
    let _chunk = data.toString();
    if(_chunk.substr(_chunk.length-1)!="\n")
      this.buffer+=_chunk;
    else {
      let lines = (this.buffer + _chunk.trim()).split("\n");
      this.buffer='';
      for(i=0;i<lines.length;i++) {
        let line = lines[i].trim();
        commands=line.split(' ');
        if(DEBUG)
          console.log(line);
        if(this.isAuthenticated===1) {
          if(commands[0].substr(0,1)==':') {
            switch(commands[1]) {
              case 'UID':
                if(commands[11]) {
                  nick=commands[2];
                  this.users[nick]={};
                  this.users[nick].server=commands[0].substr(1);
                  this.users[nick].username=commands[6];
                  this.users[nick].hostname=commands[7];
                  this.users[nick].ip=commands[8];
                  this.users[nick].gecos=commands.slice(11).join(' ').substr(1).trim();
                  this.users[nick].timestamp=commands[4];
                  this.users[nick].messages=[];
                  this.uids[commands[9]]=nick;
                }
                break;
              case 'QUIT':
                if(commands[2]) {
                  uid=commands[0].substr(1);
                  nick=this.uids[uid];
                  this.send(":"+this.target.mySID+" UID "+nick+" 1 "+(newts=Math.floor(new Date() / 1000))+" +i "+this.users[nick].username+" "+this.users[nick].hostname + " " + this.users[nick].ip + " " + (newid = this.target.mySID+uid.substr(3)) + " * :"+this.users[nick].gecos);
                  delete this.uids[uid];
                  this.uids[newid]=nick;
                  this.users[nick].timestamp=newts;
                  this.users[nick].server=this.target.host;
                  this.users[nick].messages=[];
                }
                break;
              case 'PRIVMSG':
                if(commands[3]) {
                  if(commands[2].substr(0,3)==this.target.mySID) {
                    target_nick=this.uids[commands[2]];
                    sender_nick=this.uids[commands[0].substr(1)];
                    sender=this.users[sender_nick];

                    if(target=this.users[target_nick]) {
                      msgobject={time:Math.round(Date.now()/1000),sender:sender_nick+"!"+sender.username+"@"+sender.hostname,msg:commands.slice(3).join(' ').substr(1).trim()};
                      this.users[target_nick].messages.push(msgobject);
                    }
                    if(commands[3].substr(1).toLowerCase().trim()=="release" && !commands[4]) {
                      if(sender.hostname == target.hostname && sender.username == target.username && sender.gecos == target.gecos) {
                        this.send(":"+commands[2] + " QUIT " + ":RELEASE");
                        this.send(":"+this.target.mySID + " SVSNICK " + commands[0].substr(1) + " " + target_nick +" "+ (newts=Math.round(Date.now()/1000)));
                        delete this.uids[commands[2]];
                        this.uids[commands[0].substr(1)]=target_nick;
                        this.users[target_nick].server=this.users[sender_nick].server;
                        this.users[target_nick].timestamp=newts;
                        for(n=0;n<this.users[target_nick].messages.length;n++) {
                          this.send(":"+this.target.mySID + " NOTICE " + commands[0].substr(1) + " :["+this.users[target_nick].messages[n].time+"] <"+this.users[target_nick].messages[n].sender+"> "+this.users[target_nick].messages[n].msg);
                        }
                        this.users[target_nick].messages=[];
                        delete this.users[sender_nick];
                      }
                    }
                  }
                }
              default:
                break;
            }
          }
          else {
            switch(commands[0]) {
              case 'PING':
                if(commands[1])
                  this.send("PONG "+commands[1].substr(1));
              break;
              default:
                break;
            }
          }
        }
        else {
          switch(commands[0].toUpperCase()) {
            case 'PASS':
              if(this.target.protocol=="TS6") {
                if(!(commands[1]==this.target.acceptPassword && commands[2]=="TS" && commands[3]=="6" && commands[4]==this.target.SID)) {
                  this.send("ERROR :Closing Link: Incorrect Password");
                  this.end();
                }
                else
                  this.isAuthenticated++;
              }
              break;
            case 'SERVER':
              if(this.target.protocol=="TS6") {
                if(commands[1]==this.target.host) {
                  this.target.desc=commands.slice(3).join(' ').substr(1).trim();
                  this.isAuthenticated++;
                }
              }
              break;
            case 'CAPAB':
              break;
          }
        }
      }
    }
  });
  connection.on('end',function() {
    this.end();
  });
})();
