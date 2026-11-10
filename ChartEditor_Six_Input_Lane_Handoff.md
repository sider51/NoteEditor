# 譜面エディタ引き継ぎ仕様：6入力レーンと Swap / Scramble

> この文書は v1 旧エディタ用の履歴です。v2 の Pair Swap / Flip 追加仕様は [Pair_Flip_Chart_Contract_v2.md](Pair_Flip_Chart_Contract_v2.md) を参照してください。

更新日：2026-10-19
対象：Re-Inverse の外部譜面エディタが読み書きする MusicPackages 譜面 JSON（RICF-1 / `version: 1`）

この文書はエディタ側の実装依頼にそのまま渡すための仕様である。曲情報、ファイル名、BPM・Scroll の契約は末尾の関連文書も参照する。**譜面の保存形式は7レーンのまま、プレイヤーが操作するレーンとキーは6つ**になった。旧仕様の「7番目の Space レーン」を UI や入力設定に復活させないこと。

## 1. データの正本とレーンの意味

| JSON の `lane` | エディタ上の表示・編集 | ゲーム中の入力 |
| --- | --- | --- |
| `0..5` | 左から右へ6本の通常レーン | 初期設定は順に `S D F J K L`。キー変更後はプレイヤー設定に従う |
| `6` | 6本全体にまたがる Scramble 専用のイベント行／全幅ノーツ | 専用キーはない。6キーのいずれか1回の KeyDown |

- `metadata.laneCount` は **`7` 固定**。`6` に変えると現行ランタイムはロードを拒否する。
- `lane` は0始まりの**論理レーン番号**。Swap / Scramble 後も JSON の `lane` 値を書き換えない。画面上の左右位置は別の表示レーン対応表から求める。
- `lane: 6` は `type: "scramble"` だけを許可する。Hold、Tap、Trace、Shift、Swap は置けない。
- ノーツの通常レーンは `0..5`。Swap は `0` と `5` のみ、Shift も `0..5` のみ。Scramble は `6` のみ。
- 音声・判定時刻は従来どおり Tick、BPM、`metadata.audio.offset` が決める。Scroll やレーン交換は判定時刻を動かさない。

## 2. ノーツの記録例

以下は既存の MusicPackages 譜面に追加できる `notes` 部分の例。各ノーツの `id` は譜面内で一意にする。二つの Swap が**同じ Tick**にあることが中央交換の条件であり、特別な `type` や `events` の項目は追加しない。

```json
"notes": [
  { "id": 101, "tick": 960,  "lane": 0, "type": "swap",     "size": 1 },
  { "id": 102, "tick": 1920, "lane": 0, "type": "swap",     "size": 1 },
  { "id": 103, "tick": 1920, "lane": 5, "type": "swap",     "size": 1 },
  { "id": 104, "tick": 2880, "lane": 6, "type": "scramble", "size": 1 }
]
```

この例では Tick 960 が左側の単独 Swap、Tick 1920 の二つが中央 Swap **1回**、Tick 2880 が全幅 Scramble である。実際の譜面 JSON では `version`、`metadata`、`timing`、`notes`、`events` を従来の RICF-1 に従って保存する。`metadata.laneCount: 7` を維持する。

## 3. Swap の編集・プレビュー規則

| 配置 | 譜面時刻で起きる表示レーン交換 | 入力・採点 |
| --- | --- | --- |
| `lane: 0` のみ | そのノーツの**現在の表示位置**が左端 `0` なら `1↔2`、右端 `5` なら `3↔4` | 1ノーツ、1採点単位 |
| `lane: 5` のみ | 同じく現在の表示位置が左端なら `1↔2`、右端なら `3↔4` | 1ノーツ、1採点単位 |
| 同 Tick に `lane: 0` と `lane: 5` | 表示レーン `2↔3` を**一度だけ**交換 | 左右それぞれ独立した入力判定。合計2採点単位 |

表示位置は0始まりで左から `0..5`。単独 Swap の交換対象は JSON の論理レーン番号だけで固定してはならない。Scramble で左右反転した後は、たとえば `lane: 0` の Swap が右端に見え、右側の `3↔4` を交換する。逆に同 Tick の `0+5` は、現在の対応表に関係なく中央の表示位置 `2↔3` を1回だけ交換する。

ランタイムは Swap の入力成功・失敗とは無関係に、**譜面時刻にレーン交換を自動発動**する。中央ペアの一方を取り逃しても交換は1回。二つの判定とスコアは独立している。エディタのプレビューでも交換の発動を入力結果に依存させない。

表示レーンを再現する場合は、左から並ぶ論理レーンの配列 `visualToLogical = [0,1,2,3,4,5]` を持つ。イベントを Tick 昇順に処理し、単独 Swap はトリガーの論理レーンが現在どの表示位置にあるかを求めてから交換し、同 Tick ペアは一つのイベントに束ねて中央を交換する。交換するのは配列の**表示位置**であり、保存済みノーツの `lane` ではない。Hold / Shift の表示位置は Swap に追従せず、Scramble の反転には追従するため、完全なゲーム画面プレビューでは通常ノーツ用と Hold / Shift 用の対応表を分ける。

## 4. Scramble の編集・プレビュー規則

- `lane: 6` に Scramble を**1個**置く。エディタでは7本目の細いプレイレーンに見せず、6入力レーンにまたがる全幅ノーツとして表示する。
- 譜面時刻に、表示レーン `0↔5`、`1↔4`、`2↔3` を反転する。入力に失敗しても反転する。通常ノーツ用と Hold / Shift 用の両対応表に適用する。
- 6キーのどれか1回の KeyDown で1個の Scramble を判定する。専用の Space キー入力はない。Scramble に使用した KeyDown は同時に Tap / Swap の入力へ重複使用しない。
- 通常ノーツの判定幅と取り逃し期限に `GameConfig.scrambleJudgmentWindowMultiplier = 1.5` を掛ける。これはゲーム設定であり、譜面 JSON に倍率を書かない。
- Scramble は**1個のノーツで6採点単位**。成功時は6コンボ、Lost はコンボを切る。エディタの総判定数プレビューでは6として数える。
- 同じ Tick に Scramble を2個置かない。2026-10-20以降のエディタでは、空き入力レーンが1つ以上あれば他ノーツの開始と共存できる。通常ノーツは同 Tick に最大5レーンまでとし、配置順にかかわらず6レーン目を拒否する。Hold / Shift の `endTick` が一致することは許可する。

## 5. Shift・通常ノーツとの関係

- Tap、Trace、Hold の配置・判定は6入力レーン上で維持する。Hold の頭と末尾は現行の譜面仕様どおりに扱う。
- Shift は `lane: 0..5` に置く自動長押しギミックで、入力なしで終端を採点する。Shift の表示速度効果と BPM / Scroll の計算は今回変更しない。
- Swap / Scramble はレーン変換だけ自動、**採点には入力が必要**。Shift の自動採点を Swap / Scramble に流用しない。
- BPM 変化・Scroll・Shift があっても、Swap / Scramble の発火は `tick` を BPM マップで時刻に変換した位置で行う。プレビューの左右対応を計算する際も Tick 順のイベント列を正本とする。

## 6. エディタに必要な変更

1. 編集キャンバスと入力割当の通常レーンを6本にする。`lane: 6` は全幅 Scramble を置くための操作面として残すが、7番目の押下キーや通常ノーツのドロップ先にはしない。
2. Swap ツールは `lane: 0/5` のみを選択可能にする。同 Tick の両端配置を中央 Swap として描き、プレビューでは中央交換を一度だけ実行する。別 Tick の両端 Swap は二つの単独 Swap として順に実行する。
3. Scramble ツールは `lane: 6` に一つのノーツを保存し、6レーン全幅に描く。6個の JSON ノーツへ分解しない。
4. JSON 読み込み、描画、選択、ドラッグ、複製、Undo / Redo、コピー＆ペースト、保存、構文チェック、ランタイム表示レーン計算のすべてで同じ制約を使う。無効な既存譜面を開いた場合、黙ってノーツを削除・移動・変換せず、対象 ID と Tick を示して修正を促す。
5. 再保存では `laneCount: 7`、既存の Tick、ID、BPM / Scroll、音声オフセットを保つ。今回の変更を理由に `metadata`、`timing`、`events` の別項目を再生成・丸め・欠落させない。

## 7. 保存前の必須検証

| 検査 | エラー条件 |
| --- | --- |
| 形式 | `version != 1`、`metadata.laneCount != 7`、正でない `resolution` |
| ノーツ ID・位置 | 重複 ID、負の Tick、`lane` が `0..6` の外 |
| 特殊レーン | `lane: 6` に Scramble 以外、または Scramble が `lane: 6` 以外 |
| Swap / Shift | Swap が `0/5` 以外、Shift が `0..5` 以外 |
| 同時配置 | 同 Tick・同レーンの Swap 重複、同 Tick の Scramble 重複、Scramble と同 Tick に6レーン分の通常ノーツがある状態 |
| 長押し | Hold / Shift の `endTick <= tick` |

既存の BPM / Scroll / 拍子 / オフセットの検証も維持する。同 Tick の `0+5` Swap は**エラーではなく**中央交換として扱う。エディタが表示レーンの整合性まで確認する場合は、全 Swap / Scramble を Tick 順にシミュレートし、単独 Swap のトリガーがその時点で表示端 `0` または `5` にあることを確認する。

**Unity 互換性の保留（2026-10-20）:** この同 Tick 共存はNoteEditor側のみの追加仕様。現行Unityの `ChartManager` はScrambleと他ノーツの同 Tick 開始を拒否し、`JudgementManager` はScramble入力を先に消費する。エディタは該当Tickを検証画面で警告し、JSON・MusicPackage保存時にも確認を求める。Unity側の読み込み検証と入力判定を更新するまではゲームで使用しない。

## 8. 旧譜面の扱いと受け入れ条件

Unity 側の現行8譜面は移行済み。旧形式から開く譜面に `lane: 6` の Hold / Swap 等が残っている場合は、そのまま保存してもゲーム側でロードできない。一般化した無条件の自動変換はしない。特に旧 `lane: 6` の Swap を新 `0+5` 同 Tick ペアへ変えると、既存の両端同時 Swap と意味が衝突するため、譜面ごとに目視確認してから変換する。既存8譜面で実施した変換の詳細とバックアップは [Six_Input_Lane_Migration.md](Six_Input_Lane_Migration.md) にある。

エディタ側の完了確認には、少なくとも次を含める。

1. 6通常レーンと全幅 Scramble 行が表示され、7番目の Space 入力欄がない。保存後の `laneCount` は7のまま。
2. 単独の左右 Swap、同 Tick `0+5`、別 Tick `0`→`5`、Scramble 後の単独 Swap で、プレビューの表示レーン対応がランタイム規則と一致する。
3. 同 Tick 中央 Swap の二つのノーツが独立した ID・判定対象として保存され、交換回数は1回、総判定数は2増える。Scramble 1個では総判定数が6増える。
4. 不正レーン、同 Tick 重複、Scramble と他ノーツの同時開始を保存前に拒否し、既存譜面の無関係なデータは再保存で変化しない。
5. Unity へ渡した譜面を `Re-Inverse/Rebuild MusicPackages Catalog` と実際の `ChartManager.LoadChart` で検証する。エディタ内プレビューの合格だけで Unity 実行の確認済みとはしない。

## 関連文書・実装の正本

- [MusicPackages_ChartEditor_Integration.md](MusicPackages_ChartEditor_Integration.md)：保存先、曲情報と譜面情報の所有権、RICF-1 全体契約。
- [ChartEditor_BpmScroll_Handoff.md](ChartEditor_BpmScroll_Handoff.md)：BPM 変化、Scroll、時刻・表示位置の計算。
- [Six_Input_Lane_Migration.md](Six_Input_Lane_Migration.md)：Unity 側の移行記録と既存譜面の変換。
- `Assets/Project/Assets/Scripts/GameScene/ChartManager.cs` の `GameLane`、`GameplayNoteRules`、譜面検証：レーン・採点の実装。
- `Assets/Project/Assets/Scripts/GameScene/GameManager.cs` の `ProcessGimmickEvents()` と `LaneManager.cs`：譜面時刻での交換順と表示レーン対応。
- `Assets/Project/Assets/Scripts/GameScene/JudgementManager.cs`：Swap / Scramble の入力判定。
