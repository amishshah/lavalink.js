import WebSocket = require('ws');
import { EventEmitter } from 'events';
import Connection from '../core/Connection';
import Http, { Track, TrackResponse } from '../core/Http';
import PlayerStore from '../core/PlayerStore';

export interface VoiceStateUpdate {
  guild_id: string;
  channel_id?: string;
  user_id: string;
  session_id: string;
  deaf?: boolean;
  mute?: boolean;
  self_deaf?: boolean;
  self_mute?: boolean;
  suppress?: boolean;
}

export interface VoiceServerUpdate {
  guild_id: string;
  token: string;
  endpoint: string;
}

export interface BaseNodeOptions {
  password: string;
  userID: string;
  shardCount?: number;
  hosts?: {
    rest?: string;
    ws?: string | { url: string, options: WebSocket.ClientOptions };
  };
}

export default abstract class BaseNode extends EventEmitter {
  public abstract send(guildID: string, packet: any): Promise<any>;

  public password: string;
  public userID: string;
  public shardCount?: number;

  public connection?: Connection;
  public players: PlayerStore = new PlayerStore(this);
  public http?: Http;

  public voiceStates: Map<string, string> = new Map();
  public voiceServers: Map<string, VoiceServerUpdate> = new Map();

  constructor({ password, userID, shardCount, hosts }: BaseNodeOptions) {
    super();
    this.password = password;
    this.userID = userID;
    this.shardCount = shardCount;

    if (hosts) {
      if (hosts.rest) this.http = new Http(this, hosts.rest);
      if (hosts.ws) this.connection = typeof hosts.ws === 'string' ? new Connection(this, hosts.ws) : new Connection(this, hosts.ws.url, hosts.ws.options);
    }
  }

  public load(identifier: string): Promise<TrackResponse> {
    if (this.http) return this.http.load(identifier);
    throw new Error('no available http module');
  }

  public decode(track: string): Promise<Track>;
  public decode(tracks: string[]): Promise<Track[]>;
  public decode(tracks: string | string[]): Promise<Track | Track[]> {
    if (this.http) return this.http.decode(tracks);
    throw new Error('no available http module');
  }

  public voiceStateUpdate(packet: VoiceStateUpdate) {
    if (packet.user_id !== this.userID) return Promise.resolve(false);

    this.voiceStates.set(packet.guild_id, packet.session_id);
    return this._tryConnection(packet.guild_id);
  }

  public voiceServerUpdate(packet: VoiceServerUpdate) {
    this.voiceServers.set(packet.guild_id, packet);
    return this._tryConnection(packet.guild_id);
  }

  private async _tryConnection(guildID: string) {
    const state = this.voiceStates.get(guildID);
    const server = this.voiceServers.get(guildID);
    if (!state || !server) return false;

    await this.players.get(guildID).voiceUpdate(state, server);
    this.voiceServers.delete(guildID);
    return true;
  }
}
