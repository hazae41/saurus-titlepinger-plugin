import type { App } from "saurus/src/app.ts";
import type { Extra, PlayerInfo, UUID } from "saurus/src/types.ts";
import type { Player } from "saurus/src/player.ts";
import type { Pinger } from "saurus/src/plugins.ts"
import { Cancelled } from "saurus/deps/mutevents.ts";
import { Message } from "saurus/deps/multisocket.ts";

async function launch<T>(f: () => Promise<T>) {
  return await f()
}

export class TitlePinger implements Pinger {
  uuids = new Map<UUID, boolean>()

  constructor() { }

  get(player: Player) {
    return this.uuids.get(player.uuid) ?? true
  }

  set(player: Player, value: boolean) {
    this.uuids.set(player.uuid, value)
  }

  clear(player: Player) {
    this.uuids.delete(player.uuid)
  }

  async ping(sender: Player, target: Player) {
    if (!this.get(target)) throw new Error("Not pingable")
    await target.title("Ping!", `${sender.name} pinged you`)
  }
}

export class PlayerPinger {
  /**
   * Pinger plugin that sends a title when a player is pinged.
   * @param player Player to activate the plugin on
   */
  constructor(
    readonly pinger: Pinger,
    readonly player: Player
  ) {
    const offauth = player.on(["authorize"],
      this.onapp.bind(this))

    const offinfo = player.extras.on(["pinger"],
      this.onextra.bind(this))

    player.once(["quit"], offauth, offinfo,
      this.onquit.bind(this))
  }

  private async onextra(info: Extra<PlayerInfo>) {
    const { pinger, player } = this
    info.pingable = pinger.get(player);
  }

  private async onapp(app: App) {
    const offping = app.paths.on(["/ping"],
      this.onping.bind(this))

    const offget = app.paths.on(["/ping/get"],
      this.onget.bind(this))

    const offset = app.paths.on(["/ping/set"],
      this.onset.bind(this))

    app.once(["close"], offping, offget, offset)
  }

  private async onquit() {
    const { pinger, player } = this;
    pinger.clear(player)
  }

  private async onping(msg: Message) {
    const { pinger, player } = this;

    const { channel, data } =
      msg as Message<PlayerInfo>

    try {
      const target = player.server.players.get(data)
      if (!target) throw new Error("Invalid target")

      await pinger.ping(player, target)
      await channel.close()
    } catch (e: unknown) {
      await channel.catch(e)
    }

    throw new Cancelled("TitlePinger")
  }

  private async onget(msg: Message) {
    const { pinger, player } = this

    const { channel, data } =
      msg as Message<PlayerInfo>

    try {
      const target = player.server.players.get(data)
      if (!target) throw new Error("Invalid target")

      await channel.close(pinger.get(target))
    } catch (e: unknown) {
      await channel.catch(e)
    }

    throw new Cancelled("TitlePinger")
  }

  private async onset(msg: Message) {
    const { pinger, player } = this;

    const { channel, data } =
      msg as Message<boolean>

    try {
      pinger.set(player, data)
      await channel.close()
    } catch (e: unknown) {
      await channel.catch(e)
    }

    throw new Cancelled("TitlePinger")
  }
}