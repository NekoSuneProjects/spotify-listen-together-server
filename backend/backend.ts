import { Server } from 'socket.io';
import Player from './player';
import SocketServer from './socket';

export default class Backend {
  public io: Server;
  public socketServer: SocketServer;
  public player: Player;

  constructor(io: Server) {
    this.io = io;

    this.socketServer = new SocketServer(this.io);
    this.player = new Player(this.socketServer);

    this.socketServer.addEvents(this.player);
  }
}