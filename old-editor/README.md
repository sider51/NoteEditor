# RICF-1 v1 Chart Editor（旧版）

Re-Inverse 向けの6入力レーン譜面を作成・編集するブラウザベースのエディタです。保存形式は7レーンのRICF-1です。旧形式の`.mcz`も読み込み時に変換して直接開けます。

## 起動

ブラウザのセキュリティ制約を避けるため、`index.html`を直接開かずローカルHTTPサーバーから起動してください。

```powershell
cd D:\Dev\Projects\NoteEditor
python -m http.server 5500
```

ブラウザで `http://127.0.0.1:5500/` を開きます。

Windowsアプリ版を起動する場合は、Node.jsを導入したうえで以下を実行します。

```powershell
cd windows_app
npm ci
npm run start
```

## 読み込みと保存

- JSON: RICF-1チャートをそのまま開きます。
- MCZ: Converterと同じ規則で、アーカイブ内の最大の数字フォルダにある、番号が最大の`.mc`を選択してRICF-1へ変換し、エディタへ直接開きます。
- 音声: 「ファイル」→「音声を読み込む」からチャートとは別に選択します。MCZ内の音声は自動では取り込みません。
- MusicPackageへの保存: 「ファイル」→「MusicPackageを選択」で保存先を指定し、難易度を選んで「保存」を押します。
- JSON単体の保存: 「ファイル」→「JSONを保存」でダウンロードします。Scrambleと通常ノーツが同Tickにある場合は、どちらの保存方法でもUnity互換性の警告が出ます。

MCZ展開にはリポジトリに同梱したJSZipを使用します。

## レーンとノーツ

画面上の通常レーンは1〜6です。JSON内部では0〜5で保存し、全幅Scrambleだけを`lane: 6`で保存します。

| 画面表示 | JSON lane | 用途 |
| --- | ---: | --- |
| 1〜6 | 0〜5 | 6本の通常レーン |
| 全幅Scramble | 6 | Scramble専用。入力キーは6キーのいずれか |

- 1〜6レーン: Tap / Trace / Hold / Shiftを配置できます。
- Swap: 内部lane 0 / 5のみ配置できます。同Tickの両端Swapは2ノーツで中央交換1回です。
- Scramble: 6本のどこをクリックしても全幅ノーツ1個を`lane: 6`に配置します。同Tickの通常ノーツは最大5レーンまで共存できます。Scramble用に空き入力レーンを1つ残します。
- 同一Tick・同一の実行時表示レーンへの重複配置はできません。
- ロングノーツの区間中に通常ノーツを置けます。構文チェックでは、そのTickの実行時表示レーンがロングと重なる場合だけ問題として報告します。
- Hold / ShiftはScrambleをまたげません。

Scrambleと他ノーツが同Tickにある譜面は、現在のUnityランタイムでは読み込みを拒否されます。エディタは保存前に互換性警告を表示し、続行を選んだ場合のみ保存します。Unity側の対応は別作業です。

## Swap Visualize と Swap Simulator

### Swap Visualize

JSONは変更せず、ゲーム実行時のレーン入れ替えを表示に反映します。オンのままでも、配置・移動・コピー・貼り付け・反転を通常どおり行えます。

- 単独Swapは発動時点の表示端に応じて通常ノーツ用マッピングだけを入れ替えます。同Tickの両端Swapは中央の表示位置を1回交換します。
- Scrambleは外側6レーンを左右反転し、通常ノーツ用・Hold/Shift用の両方のマッピングに反映します。
- Swap / Scrambleと同Tickのノーツは発動直前の対応表で表示します。発動後のTickから新しい対応表を使います。
- Hold / ShiftはSwapの影響を受けず、Scramble後に配置されたものはScramble後の表示位置を使います。

### Swap Simulator

「Swap Visualizeオンの見た目で作った譜面」を、ゲームで同じ見た目になる内部レーンへ逆変換します。

- 実行前に確認ダイアログを表示します。
- 実行後はUndoで完全に戻せます。
- 再実行は可能ですが、二重変換になる可能性があるため確認内容をよく読んでください。

## 操作

| 操作 | 内容 |
| --- | --- |
| 左クリック | ノーツ配置、選択、ドラッグ移動 |
| 右クリック | ノーツ削除 |
| 1〜6 | Tap / Hold / Trace / Swap / Shift / Scrambleを選択 |
| Ctrl/Cmd + C | 選択ノーツをコピー |
| Ctrl/Cmd + V | 貼り付けプレビュー開始 |
| 貼り付け中の `M` | 貼り付けゴーストを左右反転 |
| Enter または左クリック | 貼り付け確定 |
| Escape | 貼り付けキャンセル・選択解除 |
| `M` / `H` | 選択ノーツを左右反転 |
| Delete / Backspace | 選択ノーツを削除 |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z / Ctrl/Cmd + Y | Redo |
| Space | 音声の再生・停止 |
| Ctrl/Cmd + ホイール | カーソル位置を基準にズーム |
| 波形を左クリック | クリックした位置へ再生ヘッドを移動 |

ロングノーツはHeadまたはTailをクリック／矩形選択した場合のみ選択対象になります。胴体部分をクリックすると、その位置への通常ノーツ配置に使えます。

上部の「ファイル / 編集 / 譜面 / 表示」メニューから機能を選べます。ノーツ種別、配置と選択、スナップ、ズーム、再生は上部と下部に常時表示します。「譜面」→「BPM・Scroll」から任意 Tick の BPM と Scroll 倍率を編集できます。Scrollは瞬時切替と終了Tickまでのフェードを選べます。Tick 0 の BPM は必須、Scroll は空欄でもよく、最初のイベント前は 1.0 倍です。「表示」→「速度プレビュー」は音源の再生位置を基準に、BPM と Scroll を反映した通常ノーツの流れを表示します。Shift / Scramble 固有の速度演出は含みません。

「表示」→「設定」の「譜面を上下反転」を有効にすると、編集グリッド・波形・ミニマップと再生時の自動追従を上向きに切り替えます。初期状態は従来の下向き表示です。この表示設定は譜面 JSON に保存しません。確認・エラー表示はエディタ内のカスタムダイアログで行います。ファイルとフォルダーの選択、アクセス許可はブラウザまたはOSの画面が開きます。

## メタデータとJSON

エディタは以下の構造で出力します。

```json
{
  "version": 1,
  "metadata": {
    "charter": "Chart Author",
    "difficulty": { "level": 1.0 },
    "audio": { "offset": 0 },
    "grid_offset": 0,
    "laneCount": 7,
    "resolution": 960
  },
  "timing": {
    "bpms": [{ "tick": 0, "bpm": 120 }],
    "scrolls": [{ "tick": 0, "speed": 1 }],
    "timeSignatures": [{ "tick": 0, "numerator": 4, "denominator": 4 }],
    "stops": []
  },
  "notes": [],
  "events": []
}
```

- `metadata.audio`は`offset`（ミリ秒）のみです。`audio.file`と`jacket`は使用しません。
- `metadata.grid_offset`は小節線だけの位相を、拍子の分母 `1/x` 音符単位で動かす有限整数です。省略時は `0` です。4/4では `-1` が4分音符1つ前、`1` が4分音符1つ後になり、音源・判定・ノーツTickには影響しません。
- `laneCount`は保存形式として常に7です。編集・入力する通常レーンは6本（`lane: 0..5`）で、`lane: 6`は全幅Scramble専用です。専用Space入力はありません。
- Tick 0には有効なBPMが必要です。Scrollは省略可能で、省略時の倍率は1.0です。`{tick,speed}`は瞬時切替、`{tick,endTick,speed,easing}`は目標倍率までのTick基準フェードです。`easing`は`linear`（省略時）、`inQuad`、`outQuad`に対応します。重複やフェード区間の重なり、不正値は保存前に修正が必要です。
- メタデータダイアログではTick 0のBPM、拍子、音声offset、小節線オフセット、resolutionを設定できます。小節線オフセットの変更は保存直後にCanvasへプレビューされます。難易度数値は小数第2位に丸め、入力欄では`00.00`形式で表示します（JSONの数値仕様上、末尾の`0`自体は保存時に省略される場合があります）。
- 設定モーダルの「構文チェック」では、レーン範囲、ノーツ種別、ID、重複、Hold/Shiftの終端、Scramble跨ぎ、Tick 0のタイミング情報を確認できます。不正な値があれば書き出しを止めます。

## 旧譜面の互換性

旧MCZの中央レーンにTapまたはTraceが含まれる場合、現行RICF-1のScramble専用`lane: 6`には適合しません。変換自体はデータを保ったまま行いますが、エディタは警告を表示し、その状態では書き出しを拒否します。旧`lane: 6`のHoldやSwapも自動移行しません。対象ノーツを現行仕様に合わせて修正してください。

## 構成

```text
index.html             エディタ画面
converter.html         旧形式をJSONへ変換するスタンドアロンConverter
css/style.css          UIスタイル
js/config.js           定数・ノーツ種別
js/state.js            チャート状態・Swap/Scrambleマッピング・検証
js/math.js             座標・Tick・時間計算
js/timing_ui.js        BPM/Scroll 編集と速度プレビュー
js/renderer.js         Canvas描画・ゴースト・ミニマップ
js/editor.js           選択、履歴、貼り付け、Simulator
js/file_audio.js       読み込み、MCZ変換、メタデータ、音声、保存
js/input.js            マウス操作
js/main.js             キーボード・UIイベント
windows_app/           Electron版の設定
```

## MusicPackages 出力

曲全体の情報は MusicPackage が所有し、譜面JSONには曲ID・タイトル・アーティスト・難易度名を保存しません。

`<package_key>` を選択してから、LOW / MID / HIGH / SP を選び、次のいずれかへ保存します。

```text
Assets/public/MusicPackages/<package_key>/charts/
  low.json
  mid.json
  high.json
  sp.json
```

- パッケージ保存は `metadata/songdata.json` の `format_version: 3` と小文字kebab-caseの package_key を検証します。
- 曲名・アーティストは `metadata/songdata.json` の参照表示であり、このエディタは音源・ジャケット・songdata.jsonを変更しません。
- 譜面には `metadata.charter`、`metadata.difficulty.level`、`metadata.audio.offset`、`metadata.grid_offset`、タイミング、ノーツ、イベントだけを保存します。
- `metadata.id`、`metadata.title`、`metadata.artist`、`metadata.difficulty.name` は新規保存時に削除されます。
- Unityへ戻ったら再読み込みし、反映されない場合は `Re-Inverse/Rebuild MusicPackages Catalog` を実行してください。
