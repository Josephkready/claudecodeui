import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { activeRunsDb, closeConnection, initializeDatabase, sessionsDb } from '@/modules/database/index.js';
import { chatRunRegistry } from '@/modules/websocket/services/chat-run-registry.service.js';
import { reconcileInterruptedRuns } from '@/modules/websocket/services/chat-run-reconcile.service.js';
import { handleChatConnection } from '@/modules/websocket/services/chat-websocket.service.js';
import { connectedClients } from '@/modules/websocket/services/websocket-state.service.js';

/**
 * End-to-end restart lifecycle for issue #70, driven through the real
 * `chat.send` / `chat.subscribe` / `chat.resume` handlers with controllable
 * provider runtimes. Proves that a restart mid-run never silently loses the
 * in-flight OR queued message: both are surfaced as interrupted and re-dispatch,
 * in order, on resume.
 */

class FakeSocket extends EventEmitter {
  readyState = 1; // WS_OPEN_STATE
  frames: Array<Record<string, unknown>> = [];

  send(data: string): void {
    this.frames.push(JSON.parse(data) as Record<string, unknown>);
  }

  protocolErrors(): Array<Record<string, unknown>> {
    return this.frames.filter((frame) => frame.kind === 'protocol_error');
  }

  framesOfKind(kind: string): Array<Record<string, unknown>> {
    return this.frames.filter((frame) => frame.kind === kind);
  }
}

type SpawnCall = {
  command: string;
  options: Record<string, unknown>;
  writer: { send: (message: Record<string, unknown>) => void; setSessionId?: (id: string) => void };
  resolve: () => void;
};

function makeControllableSpawn() {
  const calls: SpawnCall[] = [];
  const spawn = (command: string, options: unknown, writer: unknown): Promise<void> =>
    new Promise<void>((resolve) => {
      calls.push({
        command,
        options: (options ?? {}) as Record<string, unknown>,
        writer: writer as SpawnCall['writer'],
        resolve,
      });
    });
  return { spawn, calls };
}

function finishRun(call: SpawnCall): void {
  call.writer.send({ kind: 'complete', provider: 'claude', sessionId: 'native', exitCode: 0 });
  call.resolve();
}

function makeDependencies(spawn: ReturnType<typeof makeControllableSpawn>['spawn']) {
  return {
    spawnFns: { claude: spawn, codex: spawn },
    abortFns: { claude: () => true, codex: () => true },
    resolveToolApproval: () => {},
    getPendingApprovalsForSession: () => [],
  } as unknown as Parameters<typeof handleChatConnection>[2];
}

const request = { user: { id: 'tester' } } as unknown as Parameters<typeof handleChatConnection>[1];

function connect(socket: FakeSocket, dependencies: Parameters<typeof handleChatConnection>[2]): void {
  handleChatConnection(socket as unknown as Parameters<typeof handleChatConnection>[0], request, dependencies);
}

function sendChat(socket: FakeSocket, sessionId: string, content: string): void {
  socket.emit('message', JSON.stringify({ type: 'chat.send', sessionId, content }));
}

function subscribe(socket: FakeSocket, sessionId: string): void {
  socket.emit('message', JSON.stringify({ type: 'chat.subscribe', sessions: [{ sessionId }] }));
}

function resume(socket: FakeSocket, sessionId: string): void {
  socket.emit('message', JSON.stringify({ type: 'chat.resume', sessionId }));
}

async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function withIsolatedDatabase(runTest: () => void | Promise<void>): Promise<void> {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'chat-restart-'));
  const databasePath = path.join(tempDirectory, 'auth.db');

  closeConnection();
  process.env.DATABASE_PATH = databasePath;
  await initializeDatabase();

  try {
    await runTest();
  } finally {
    connectedClients.clear();
    chatRunRegistry.clearAll();
    closeConnection();
    if (previousDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

test('a restart mid-run surfaces the in-flight AND queued messages as interrupted, and resume re-dispatches both in order', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('restart-session', 'claude', '/workspace/demo');
    const { spawn, calls } = makeControllableSpawn();
    const dependencies = makeDependencies(spawn);

    const device = new FakeSocket();
    connect(device, dependencies);

    // A run starts for message A; message B queues behind it.
    sendChat(device, 'restart-session', 'A');
    sendChat(device, 'restart-session', 'B');
    await settle();
    assert.equal(calls.length, 1, 'only A spawned; B is queued');

    // The provider announces its native id mid-run, so a resume can continue the
    // same transcript by provider session id.
    calls[0]?.writer.send({ kind: 'session_created', provider: 'claude', sessionId: 'prov-1', newSessionId: 'prov-1' });
    assert.equal(sessionsDb.getSessionById('restart-session')?.provider_session_id, 'prov-1');

    // --- Simulate a hard restart: the in-memory registry (and the provider
    // subprocess) are wiped, but the SQLite journal survives. ---
    chatRunRegistry.clearAll();
    connectedClients.clear();

    const summary = reconcileInterruptedRuns();
    assert.equal(summary.interruptedSessions, 1);
    assert.equal(summary.interruptedMessages, 2, 'both the in-flight and queued messages survive');
    assert.deepEqual(
      activeRunsDb.getInterrupted('restart-session').map((row) => row.content),
      ['A', 'B'],
      'in original arrival order',
    );

    // --- A fresh client connects after the restart. ---
    const reconnected = new FakeSocket();
    connect(reconnected, dependencies);

    subscribe(reconnected, 'restart-session');
    await settle();
    const subscribed = reconnected.framesOfKind('chat_subscribed')[0];
    assert.equal(subscribed?.isProcessing, false, 'no live run after the restart');
    assert.equal(subscribed?.interrupted, true, 'the session is surfaced as interrupted, not silently idle');

    // --- One-click resume re-dispatches the stranded work. ---
    resume(reconnected, 'restart-session');
    await settle();

    const resumed = reconnected.framesOfKind('chat_resumed')[0];
    assert.equal(resumed?.resumed, 2, 'both messages resumed');

    // The head run A re-dispatches, resuming by provider session id.
    assert.equal(calls.length, 2, 'resume spawned the head run again');
    assert.equal(calls[1]?.command, 'A');
    assert.equal(calls[1]?.options.resume, true, 'resumes rather than starting fresh');
    assert.equal(calls[1]?.options.sessionId, 'prov-1', 'by the provider-native session id');

    // Finishing A drains the queued B — proving the queued message was NOT lost.
    finishRun(calls[1] as SpawnCall);
    await settle();
    assert.equal(calls.length, 3);
    assert.equal(calls[2]?.command, 'B');

    finishRun(calls[2] as SpawnCall);
    await settle();

    // A fully-drained resume leaves no journal rows and no interrupted state.
    assert.equal(activeRunsDb.getBySession('restart-session').length, 0);
    assert.equal(activeRunsDb.hasInterrupted('restart-session'), false);
    assert.equal(reconnected.protocolErrors().length, 0);
  });
});

test('a normally-completed run leaves no interrupted ghost after a restart reconcile', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('clean-session', 'claude', '/workspace/demo');
    const { spawn, calls } = makeControllableSpawn();
    const dependencies = makeDependencies(spawn);

    const device = new FakeSocket();
    connect(device, dependencies);

    sendChat(device, 'clean-session', 'just one');
    await settle();
    finishRun(calls[0] as SpawnCall);
    await settle();

    // The completed run cleared its journal row, so a restart reconcile finds
    // nothing to surface (no false "interrupted").
    assert.equal(activeRunsDb.getBySession('clean-session').length, 0);
    assert.equal(reconcileInterruptedRuns().interruptedMessages, 0);

    const reconnected = new FakeSocket();
    connect(reconnected, dependencies);
    subscribe(reconnected, 'clean-session');
    await settle();
    assert.equal(reconnected.framesOfKind('chat_subscribed')[0]?.interrupted, false);
  });
});

test('while draining, chat.send is refused with a visible SERVER_DRAINING error (no run started, no silent drop)', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('drain-session', 'claude', '/workspace/demo');
    const { spawn, calls } = makeControllableSpawn();
    const dependencies = makeDependencies(spawn);

    const device = new FakeSocket();
    connect(device, dependencies);

    chatRunRegistry.beginDrain();
    sendChat(device, 'drain-session', 'too late');
    await settle();

    assert.equal(calls.length, 0, 'no run started during drain');
    const draining = device.protocolErrors().filter((frame) => frame.code === 'SERVER_DRAINING');
    assert.equal(draining.length, 1, 'the client is told to retry rather than losing the message');
    assert.equal(draining[0]?.sessionId, 'drain-session');
  });
});

test('resume is a safe no-op (acked, no spawn) for a session with no interrupted work', async () => {
  await withIsolatedDatabase(async () => {
    sessionsDb.createAppSession('noop-session', 'claude', '/workspace/demo');
    const { spawn, calls } = makeControllableSpawn();
    const dependencies = makeDependencies(spawn);

    const device = new FakeSocket();
    connect(device, dependencies);

    resume(device, 'noop-session');
    await settle();

    assert.equal(calls.length, 0, 'nothing to re-dispatch');
    assert.equal(device.framesOfKind('chat_resumed')[0]?.resumed, 0);
    assert.equal(device.protocolErrors().length, 0);
  });
});
