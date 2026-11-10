# NoteEditor — RICF-1 v2

Re-Inverse の MusicPackages 向け6入力レーン譜面エディタ。GitHub Pages などの静的ホスティングで動作します。現行の譜面契約は [Pair_Flip_Chart_Contract_v2.md](Pair_Flip_Chart_Contract_v2.md) を参照してください。

## 起動

`python -m http.server 5500` をプロジェクトルートで実行し、`http://127.0.0.1:5500/` を開きます。Electron 版は `cd windows_app`、`npm ci`、`npm run start` で起動します。MCZ の展開に使う JSZip はリポジトリに同梱しています。

## 編集

- JSON は `version: 2`、`metadata.laneCount: 7`。入力レーンは `0..5` の6本、`lane: 6` は全幅 Scramble 専用です。
- Pair ツール（`4`）は同じ Tick の異なる2レーンを順にクリックして1セットを作ります。Flip ツール（`7`）は始点と移動先を順にクリックします。Pair の番号付き2点、Flip の移動先枠と矢印、Scramble の全幅帯が配置プレビューに出ます。Esc で配置途中を中止します。
- Flip の移動先は選択時の半透明ハンドル、または情報パネルの方向・歩数から変更できます。複数選択で一括変更もできます。同 Tick の Pair は1セットまで、Flip は移動区間が他の移動区間と重ならない限り複数置けます。
- 「後続の見た目を維持」をオンにすると、ギミック編集後のノーツとギミックの論理レーンを再割当します。Pair / Scramble / Flip の配置モードでは Shift を押している間だけチェックが一時的に付き、離すと元に戻ります。手動で付けたチェックは維持されます。維持できない場合は編集を取り消します。
- `1`～`7` で種別選択、Ctrl/Cmd+C・V でコピー・貼り付け、`M` で選択を左右反転、Ctrl/Cmd+Z・Y で Undo・Redo。音声、BPM・Scroll、波形シーク、速度プレビュー、譜面上下反転、ミニマップも利用できます。
- v1 JSON は `old-editor` の別画面で開きます。旧 Swap 以外の選択ノーツを新エディタへ送れます。旧 Swap の意味は自動変換しません。

MusicPackage へ保存するには File System Access API 対応ブラウザでフォルダーを選んでください。JSON 単体のダウンロードもできます。現行 Unity が未対応の同 Tick 複数移動は保存時に警告します。

## 検証

`node --test --test-isolation=none tests/timing.test.js tests/gimmicks.test.js`、`node tests/pair-flip-browser-smoke.js`、`node tests/browser-smoke.js`。最後のテストは退避した v1 エディタの回帰確認です。Electron で新エディタと旧版連携を確認する場合は `ELECTRON_PATH` に `electron.exe` を指定して `pair-flip-browser-smoke.js` を実行します。
