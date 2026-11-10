// Constants
  // ---------------------------------------------------------------
  const RULER_W = 74;
  const LANE_W = 62;
  const BASE_PX_PER_TICK = 90/960;
  const NOTE_H = 14;
  const MIN_HOLD_LEN_UNITS = 1;
  const HISTORY_LIMIT = 100;
  const MIN_ZOOM = 0.25, MAX_ZOOM = 4;

  const TYPE_META = {
    tap:   { color: getVar('--tap'),   label:'TAP',   hasEnd:false },
    hold:  { color: getVar('--hold'),  label:'HOLD',  hasEnd:true  },
    trace: { color: getVar('--trace'), label:'TRACE', hasEnd:false },
    swap:  { color: getVar('--swap'),  label:'SWAP',  hasEnd:false },
    shift:    { color: getVar('--shift'),    label:'SHIFT',    hasEnd:true  },
    scramble: { color: getVar('--scramble'), label:'SCRAMBLE', hasEnd:false },
  };
  function getVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  const SNAP_OPTIONS = [
    {n:3,  label:'1/3 (2拍3連)'}, {n:4,  label:'1/4'}, {n:6,  label:'1/6 (1拍3連)'}, {n:8,  label:'1/8'},
    {n:12, label:'1/12 (8分3連)'}, {n:16, label:'1/16'}, {n:24, label:'1/24 (16分3連)'}, {n:32, label:'1/32'},
    {n:48, label:'1/48 (32分3連)'}, {n:64, label:'1/64'},
  ];

  const HINTS = {
    place: [
      ['配置', '空セルをクリック'],
      ['HOLD配置', 'ドラッグ'],
      ['移動', 'ノーツをドラッグ'],
      ['削除', '右クリック / Del'],
      ['選択解除', 'Esc'],
      ['元に戻す', 'Ctrl+Z'],
      ['ズーム', 'Ctrl+スクロール'],
    ],
    select: [
      ['単一選択', 'クリック'],
      ['追加/除外', 'Ctrl+クリック'],
      ['範囲選択', 'Shift+クリック'],
      ['同種一括選択', 'Alt+クリック'],
      ['矩形選択', '空セルをドラッグ'],
      ['まとめて移動', '選択中ノーツをドラッグ'],
      ['削除', '右クリック(単体) / Del(選択全て)'],
      ['選択解除', 'Esc'],
    ]
  };

  // ---------------------------------------------------------------