import { Socket } from "socket.io"

export default class ClientInfo {
  public latency = 0
  public name = "Unnamed"
  public isHost = false
  public loggedIn = false
  public trackUri = ""
  public trackUriUpdatedAt = Date.now()

  constructor(
    public socket: Socket,
    public ipAddress = "",
    public visitorId = "",
  ) {}
}
