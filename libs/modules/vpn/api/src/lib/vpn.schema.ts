import {encryptedText, users} from '@pd/api-core/schema';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {AwgObfuscation} from './awg-config';

/**
 * The VPN server of the dashboard's owner (AmneziaWG on the same server, deploy/vpn): its keys
 * and where devices reach it. Made once by the server's job; a sync client gets it with the
 * rest. Written again only when the host or port changes.
 */
export const vpnServers = pgTable(
  'vpn_servers',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    privateKey: encryptedText().notNull(),
    publicKey: text().notNull(),
    /** The name devices connect to (`vpn.<domain>`): moving to another IP changes only DNS. */
    host: text().notNull(),
    port: integer().notNull(),
    obfuscation: jsonb().$type<AwgObfuscation>().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [unique().on(table.userId)],
);

/**
 * A device allowed into the VPN and its keys (to show its config again). Added, renamed and
 * deleted only on the server (a sync client asks it, see VpnServerActions): two instances never
 * hand out the same address, and a deleted device is not brought back by the other side.
 */
export const vpnDevices = pgTable(
  'vpn_devices',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    name: text().notNull(),
    kind: text().$type<'phone' | 'computer' | 'other'>().notNull(),
    privateKey: encryptedText().notNull(),
    publicKey: text().notNull(),
    presharedKey: encryptedText().notNull(),
    /** Its address inside the tunnel, `10.77.0.N`. */
    address: text().notNull(),
    /**
     * The internet off when the VPN fails: the desktop app starts the tunnel that blocks around
     * the VPN; the phone's app points to Android's "Block connections without VPN".
     */
    killSwitch: boolean().notNull().default(true),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp({withTimezone: true}),
  },
  table => [
    index().on(table.userId),
    unique().on(table.userId, table.address),
    unique().on(table.publicKey),
  ],
);

/**
 * A day of a device in the VPN: bytes each way and minutes connected, added every 15 minutes
 * (not every minute: a synced table written each minute would keep the sync from ever being
 * idle, and the comparison with the server runs only then). Kept when the device is deleted.
 */
export const vpnDays = pgTable(
  'vpn_days',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    deviceId: uuid().references(() => vpnDevices.id, {onDelete: 'set null'}),
    day: date().notNull(),
    /** From the device (what it sent) and to it (what it downloaded). */
    rxBytes: bigint({mode: 'number'}).notNull().default(0),
    txBytes: bigint({mode: 'number'}).notNull().default(0),
    onlineMinutes: integer().notNull().default(0),
  },
  table => [
    index().on(table.userId, table.day),
    unique().on(table.deviceId, table.day),
  ],
);

/**
 * What the VPN container tells every minute lives in a schema of its own: it is the server's
 * live state, never synced (a row changing each minute would keep the sync busy for good) and
 * not kept in the trash. A sync client has these tables empty.
 */
export const vpnLive = pgSchema('vpn');

/** The container: when it last wrote its status and what the owner was last told. */
export const vpnServerState = vpnLive.table('server_state', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  statusAt: timestamp({withTimezone: true}),
  /** `up` or `down`; `null` — not yet seen running. */
  state: text().$type<'up' | 'down'>(),
});

/** A device as the container sees it, and its bytes and minutes not yet added to its day. */
export const vpnDeviceState = vpnLive.table('device_state', {
  deviceId: uuid()
    .primaryKey()
    .references(() => vpnDevices.id, {onDelete: 'cascade'}),
  userId: uuid()
    .notNull()
    .references(() => users.id, {onDelete: 'cascade'}),
  firstConnectedAt: timestamp({withTimezone: true}),
  lastHandshakeAt: timestamp({withTimezone: true}),
  /** The address it came from last (no port). */
  lastAddress: text(),
  /** Connected at the last look: going off is told about (a phone left on plain internet). */
  online: boolean().notNull().default(false),
  /** The container's counters at the last look: the next look's bytes are the difference. */
  seenRx: bigint({mode: 'number'}).notNull().default(0),
  seenTx: bigint({mode: 'number'}).notNull().default(0),
  /** Counted since the last flush into `vpn_days`, for `pendingDay`. */
  pendingDay: date(),
  pendingRx: bigint({mode: 'number'}).notNull().default(0),
  pendingTx: bigint({mode: 'number'}).notNull().default(0),
  pendingMinutes: integer().notNull().default(0),
});

/**
 * The networks a device came from, 90 days: a new one is told about (a key that leaked would
 * show up from somewhere else).
 */
export const vpnNetworks = vpnLive.table(
  'networks',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    deviceId: uuid()
      .notNull()
      .references(() => vpnDevices.id, {onDelete: 'cascade'}),
    /** `93.84.0.0/16` or an IPv6 `/48`. */
    network: text().notNull(),
    /** The last address seen in it. */
    address: text().notNull(),
    firstSeenAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    lastSeenAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [
    index().on(table.userId),
    unique().on(table.deviceId, table.network),
  ],
);
