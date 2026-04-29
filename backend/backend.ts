import { Server } from 'socket.io';
import SessionManager from './sessionManager';
import BanManager from './banManager';

export default class Backend {
  public io: Server;
  public sessionManager: SessionManager;

  constructor(io: Server, banManager: BanManager) {
    this.io = io;
    this.sessionManager = new SessionManager(this.io, banManager);
  }
}
