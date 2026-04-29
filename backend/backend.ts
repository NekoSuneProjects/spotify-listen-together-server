import { Server } from 'socket.io';
import SessionManager from './sessionManager';

export default class Backend {
  public io: Server;
  public sessionManager: SessionManager;

  constructor(io: Server) {
    this.io = io;
    this.sessionManager = new SessionManager(this.io);
  }
}
