---
summary: "WeCom setup for Bot WebSocket, Bot webhook, and Agent application modes"
read_when:
  - You want to connect OpenClaw to WeCom
  - You are choosing between Bot WebSocket, Bot webhook, and Agent modes
  - You are configuring WeCom callback URLs or access controls
title: "WeCom"
---

OpenClaw connects to WeCom through the external
`@wecom/wecom-openclaw-plugin` plugin maintained by the Tencent WeCom team.
It supports direct messages, group chats, media, streaming Bot replies, and
proactive delivery through a configured Agent application.

## Recommended setup: Bot WebSocket

Bot WebSocket mode is the simplest path. It needs a Bot ID and Secret, and does
not require a public callback URL.

<Steps>
  <Step title="Create a WeCom AI Bot">
    Create a bot using the
    [WeCom AI Bot documentation](https://open.work.weixin.qq.com/help?doc_id=21657),
    then copy its Bot ID and Secret.
  </Step>

  <Step title="Add the channel">

    ```bash
    openclaw channels add --channel wecom
    ```

    The channel catalog installs the pinned external plugin, then the setup
    wizard asks for the Bot ID, Secret, and direct-message policy.

  </Step>

  <Step title="Restart and verify">

    ```bash
    openclaw gateway restart
    openclaw channels status --channel wecom
    openclaw logs --follow
    ```

    Confirm the logs show a successful WeCom WebSocket connection. Channel
    status confirms configuration and runtime state; it is not a live message
    round-trip test.

  </Step>
</Steps>

Equivalent JSON5 configuration:

```json5
{
  channels: {
    wecom: {
      enabled: true,
      botId: "your-bot-id",
      secret: "your-bot-secret",
      dmPolicy: "pairing",
      groupPolicy: "allowlist",
      groupAllowFrom: ["allowed-group-id"],
      groups: {
        "allowed-group-id": {
          allowFrom: ["allowed-user-id"],
        },
      },
    },
  },
}
```

## Bot WebSocket access control

The plugin defaults both `dmPolicy` and `groupPolicy` to `"open"`. Tighten
those defaults before exposing a production Bot WebSocket:

- For DMs, use `dmPolicy: "pairing"` or `"allowlist"`.
- For groups, use `groupPolicy: "allowlist"` with group IDs in
  `groupAllowFrom`.
- To restrict senders inside an allowed group, set
  `groups.<groupId>.allowFrom`.

Approve Bot WebSocket pairing requests with:

```bash
openclaw pairing list wecom
openclaw pairing approve wecom <CODE>
```

See [Pairing](/channels/pairing) and [Security](/gateway/security) for the
shared access-control model.

<Warning>
  In plugin version `2026.5.7`, these fields gate ordinary inbound messages
  only in Bot WebSocket mode. Bot webhook and Agent modes use `dmPolicy` and
  `allowFrom` for **command authorization**, but still dispatch ordinary
  messages and group traffic. Do not treat those fields as a webhook or Agent
  message ACL. Scope the WeCom bot/application to the intended audience and
  enforce any additional ingress restrictions outside the plugin.
</Warning>

## Connection modes

| Mode                        | Required configuration                                                                                            | Public callback                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Bot WebSocket (recommended) | `botId`, `secret`                                                                                                 | No                                                           |
| Bot webhook                 | `connectionMode: "webhook"`, `token`, `encodingAESKey`; optional `receiveId`                                      | `/plugins/wecom/bot` or `/plugins/wecom/bot/<accountId>`     |
| Agent application           | `agent.corpId`, `agent.corpSecret`, `agent.token`, `agent.encodingAESKey`; `agent.agentId` for proactive delivery | `/plugins/wecom/agent` or `/plugins/wecom/agent/<accountId>` |

Bot and Agent credentials can coexist on one account. The Bot path handles
streaming conversations; the Agent application enables API-driven proactive
delivery when `agentId` is configured.

## Bot webhook mode

Use Bot webhook mode when WeCom must call a public HTTPS endpoint instead of
opening the plugin's outbound WebSocket connection.

```json5
{
  channels: {
    wecom: {
      enabled: true,
      connectionMode: "webhook",
      token: "your-callback-token",
      encodingAESKey: "your-43-character-aes-key",
      receiveId: "optional-receiver-id",
    },
  },
}
```

Expose one of these paths through your HTTPS reverse proxy:

- Single account: `/plugins/wecom/bot`
- Named account: `/plugins/wecom/bot/<accountId>`

Configure OpenClaw and restart the Gateway **before** saving the callback in
WeCom. WeCom verifies the URL immediately, so the Gateway must already have
the matching Token and EncodingAESKey.

## Agent application mode

Create a self-built application in the
[WeCom admin console](https://work.weixin.qq.com/wework_admin/frame#apps).
Record its CorpID and CorpSecret, then create the callback Token and
EncodingAESKey under the application's API receive settings.

```json5
{
  channels: {
    wecom: {
      enabled: true,
      agent: {
        corpId: "ww1234567890abcdef",
        corpSecret: "your-corp-secret",
        agentId: 1000002,
        token: "your-callback-token",
        encodingAESKey: "your-43-character-aes-key",
      },
    },
  },
}
```

Expose `/plugins/wecom/agent` for a single account or
`/plugins/wecom/agent/<accountId>` for a named account. As with Bot webhooks,
restart the Gateway before saving the callback URL so WeCom's immediate GET
verification can succeed.

`agentId` is optional for receiving callbacks but required for proactive
messages sent through the Agent API.

## Multiple accounts

Use `defaultAccount` and `accounts` when multiple WeCom bots or applications
share one Gateway. Account settings override top-level defaults.

```json5
{
  channels: {
    wecom: {
      enabled: true,
      defaultAccount: "main",
      dmPolicy: "allowlist",
      accounts: {
        main: {
          botId: "main-bot-id",
          secret: "main-bot-secret",
          allowFrom: ["main-user-id"],
        },
        support: {
          botId: "support-bot-id",
          secret: "support-bot-secret",
          allowFrom: ["support-user-id"],
        },
      },
    },
  },
  bindings: [
    {
      agentId: "main",
      match: { channel: "wecom", accountId: "main" },
    },
    {
      agentId: "support",
      match: { channel: "wecom", accountId: "support" },
    },
  ],
}
```

Use the matching account callback suffix, such as
`/plugins/wecom/agent/support`, for webhook-based accounts.
Configure an explicit `bindings` entry for every named account; named WeCom
accounts do not implicitly fall back to the default agent route.

## Troubleshooting

### Bot WebSocket does not connect

1. Recheck the Bot ID and Secret.
2. Confirm outbound access to `wss://openws.work.weixin.qq.com`.
3. Restart the Gateway and inspect `openclaw logs --follow`.

### Callback verification fails

1. Confirm the public URL reaches the correct `/plugins/wecom/...` path.
2. Confirm HTTPS termination and reverse-proxy routing are working.
3. Recheck the callback Token and EncodingAESKey.
4. Restart the Gateway before saving the callback again.

### Bot WebSocket direct or group messages are ignored

1. Check `dmPolicy`, `allowFrom`, `groupPolicy`, and `groupAllowFrom`.
2. For a group sender restriction, check `groups.<groupId>.allowFrom`.
3. Use WeCom user and group IDs, not display names.

For Bot webhook and Agent modes, those policy fields do not gate ordinary
messages in plugin version `2026.5.7`; inspect callback routing and logs instead.

Treat Bot Secrets, CorpSecrets, callback Tokens, and EncodingAESKeys as
credentials. Rotate them immediately if they are exposed.

Plugin source:
[WecomTeam/wecom-openclaw-plugin](https://github.com/WecomTeam/wecom-openclaw-plugin).
