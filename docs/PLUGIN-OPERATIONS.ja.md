# プラグイン運用

[English](PLUGIN-OPERATIONS.md) · [API](API.ja.md)

## 導入

明示的 lazy catalog の metadata は `{id, requires, load}` です。load の implementation/default module は id が一致する必要があります。hard dependency は catalog metadata が正本です。built-in は `tilia-`、外部は valid vendor／`x-` prefix。factory の `builtins` catalog を拡張するか、import した definition を `app.use` に渡してください。convention resolver、pluginUrls/pluginLoader、migration allowlist はありません。

```js
const plugin = (await import("../plugins/x-milestone/loader.js")).default;
await app.use(plugin, { enabled: true });
await app.unuse(plugin.id);
```

setup は app ではなく guarded PluginContext を受け取り、undefined／cleanup function／`{dispose}` だけを返します。依存は requires、service は typed registration で明示します。登録は staged/atomic で、失敗は rollback します。service API を setup result で公開しません。styles は `context.styles.use` で lease し、afterCommit は void を返して、開始する request/resource を Scope に所有させます。

## 所有権と後始末

```js
export default {
  id: "x-example", requires: [],
  setup(context) {
    const timer = setTimeout(context.scope.guard(() => {}), 1000);
    context.scope.defer(() => clearTimeout(timer), {
      label: "example-timer", retry: "safe",
    });
    context.map.listen("click", () => {});
  },
};
```

MapFacade、割り当てられた UI mount、stylesheet lease、Scope child を使用し、物理取得前に cleanup を予約してください。捕捉済み dispose/unsubscribe/release を使い、cleanup 中の operational lookup／新規取得を避けます。部分失敗後も安全な場合だけ retry safe を指定します。成功済み record は繰り返さず、failure 後も独立 cleanup を続けます。

close は完了 Promise を通知前に予約し、tree の失効・abort → cancellation → 明示的 awaitable work → child 逆順 → setup-return cleanup → local LIFO の順序です。同じ親 shutdown 中に開始した child close は join し、以前からの child residual の親 safe cleanup／明示的 safe retry は維持します。disposer が自身の Scope completion を await することは禁止です。

scope.track の既定は非 awaitable。必須 resource preparation/disposer handoff は待機しますが、plain parsing や承認済み detached acquisition は一律待機に変更しません。abort は物理 cleanup の完了証拠ではありません。retained provider Scope が物理的に alive でも app shutdown 後の新規 operation/publication は不可。guard と final commit を確認し、捕捉済み cleanup は呼べるままにします。

setup/cleanup から app/Runtime use/unuse/destroy を呼ばないでください。識別可能な同期 call は拒否しますが、任意の await 後の provenance/self-await は一般に検出できません。advanced Map は借用で、他 renderer の private layer へのアクセス権ではありません。Map 上の effect は app とともに終了し、無関係な page work は作成者が管理します。

Milestone は entry の logical deletion 時に同期撤去し、final removed 前に cleanup を join します。Editor は source から独立した draft/session を所有し、source 変更・削除や renderer uninstall は Save Copy を妨げません。Cancel は source を復元しません。suppression は persistent visibility を変更せず、vendor helper の承認済み pane 例外・vendor bytes を維持します。

failure は quarantine／residual として報告され、成功 reinstall は保証しません。app は終端となり、必要な prerequisite は unavailable のまま保守的に保持し、lease の強制解放・自動回復は行いません。独立 cleanup 後の Map.remove が最後の試行です。新しい公開 diagnostic/retry API はありません。
