# high.json テスト譜面

- `high.original.json`: 2026-10-29 にユーザーが指定した `C:\Users\mainc\Downloads\high.json` の無変更コピー。SHA-256: `D24F5A197396C279ABA2AD56F99665C5916AE26F993619B80539E796FE456E41`。
- `high.json`: エディタの保存前検証が報告した16件を解消した版。重複した12個の Tap（ID 456, 467, 498, 637, 638, 640, 642, 644, 646, 1589, 1598, 1601）の `lane` だけを空きスロットへ変更。ID、Tick、ノーツ数、BPM、Scroll、Hold長、移動イベントは維持。
- `node tests/audit-high-fixture.js` で保存前検証を再実行できる。`node tests/fix-high-fixture.js` は一度きりの変換記録であり、バックアップが存在すると再実行を拒否する。

Chrome と Electron のブラウザテストでは修正版を読み込み、Pair / Flip を追加しても保存前エラーが0件であることを確認している。元ファイルの既存エラーは16件だが、無関係の既存エラーだけを理由に新しい Pair / Flip の編集を拒否しない。
