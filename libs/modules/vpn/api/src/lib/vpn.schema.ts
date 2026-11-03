import {encryptedText, users} from '@pd/api-core/schema';
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {AwgObfuscation} from './awg-config';

/**
 * The VPN server of the dashboard's owner (AmneziaWG on the same server, deploy/vpn): its keys,
 * where devices reach it and what the container last told. Made by the server's job; a sync
 * client gets it with the rest and only shows it.
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
    /** When the container last wrote its status; old — the VPN is down. */
    statusAt: timestamp({withTimezone: true}),
    /** What the owner was last told: `up` or `down` (`null` — not yet seen running). */
    state: text().$type<'up' | 'down'>(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [uniqueIndex().on(table.userId)],
);

/** A device allowed into the VPN: its keys (to show its config again) and what it did last. */
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
    firstConnectedAt: timestamp({withTimezone: true}),
    lastHandshakeAt: timestamp({withTimezone: true}),
    /** The address it came from last (no port). */
    lastAddress: text(),
    /** The container's counters at the last look: today's bytes are the difference. */
    seenRx: bigint({mode: 'number'}).notNull().default(0),
    seenTx: bigint({mode: 'number'}).notNull().default(0),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp({withTimezone: true}),
  },
  table => [
    index().on(table.userId),
    uniqueIndex().on(table.userId, table.address),
    uniqueIndex().on(table.publicKey),
  ],
);

/**
 * A day of a device in the VPN: bytes each way and minutes connected. Kept when the device is
 * deleted (without it), so the history of the days stays whole.
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
    uniqueIndex().on(table.deviceId, table.day),
  ],
);

/**
 * The networks a device came from, 90 days: a new one is told about (a key that leaked would
 * show up from somewhere else).
 */
export const vpnNetworks = pgTable(
  'vpn_networks',
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
    uniqueIndex().on(table.deviceId, table.network),
  ],
);
