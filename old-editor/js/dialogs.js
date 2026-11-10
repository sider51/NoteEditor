// Shared in-app dialogs. Native file and directory permission pickers remain browser-owned.
const appDialogState = {active:null, returnFocus:null, resolve:null, queue:[]};

function openAppModal(overlay){
  if(!overlay) return;
  overlay._returnFocus = document.activeElement?.closest?.('.app-menu')?.previousElementSibling || document.activeElement;
  overlay.classList.add('open');
  const target = overlay.querySelector('[autofocus], button:not(:disabled), input:not(:disabled), select:not(:disabled)');
  target?.focus();
}

function closeAppModal(overlay){
  if(!overlay) return;
  overlay.classList.remove('open');
  const target = overlay._returnFocus;
  overlay._returnFocus = null;
  if(target?.isConnected) target.focus();
}

function presentAppDialog({title='確認', message='', confirmText='OK', cancelText=null, danger=false},resolve){
  const overlay = document.getElementById('appDialogOverlay');
  const titleEl = document.getElementById('appDialogTitle');
  const messageEl = document.getElementById('appDialogMessage');
  const accept = document.getElementById('appDialogAccept');
  const cancel = document.getElementById('appDialogCancel');
  titleEl.textContent = title;
  messageEl.textContent = String(message);
  accept.textContent = confirmText;
  accept.classList.toggle('danger-outline',danger);
  cancel.hidden = !cancelText;
  if(cancelText) cancel.textContent = cancelText;
  appDialogState.active = overlay;
  appDialogState.resolve = resolve;
  appDialogState.returnFocus = document.activeElement?.closest?.('.app-menu')?.previousElementSibling || document.activeElement;
  overlay.classList.add('open');
  (cancelText ? cancel : accept).focus();
}
function showAppDialog(options={}){
  return new Promise(resolve=>{
    if(appDialogState.active) appDialogState.queue.push({options,resolve});
    else presentAppDialog(options,resolve);
  });
}

function finishAppDialog(accepted){
  if(!appDialogState.active) return;
  appDialogState.active.classList.remove('open');
  const resolve = appDialogState.resolve;
  const focus = appDialogState.returnFocus;
  appDialogState.active = null;
  appDialogState.resolve = null;
  appDialogState.returnFocus = null;
  if(focus?.isConnected) focus.focus();
  resolve?.(accepted);
  const next=appDialogState.queue.shift();
  if(next) queueMicrotask(()=>presentAppDialog(next.options,next.resolve));
}

function showAppMessage(message,title='通知'){
  return showAppDialog({title,message});
}

function showAppConfirm(message,title='確認',confirmText='続行'){
  return showAppDialog({title,message,confirmText,cancelText:'キャンセル'});
}

let toastTimer = null;
function showAppToast(message){
  const toast = document.getElementById('appToast');
  toast.textContent = String(message);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove('show'),4200);
}

document.getElementById('appDialogAccept').addEventListener('click',()=>finishAppDialog(true));
document.getElementById('appDialogCancel').addEventListener('click',()=>finishAppDialog(false));
document.getElementById('appDialogOverlay').addEventListener('mousedown',event=>{
  if(event.target===event.currentTarget) finishAppDialog(false);
});

document.addEventListener('keydown',event=>{
  const open = appDialogState.active || [...document.querySelectorAll('.modal-overlay.open')].at(-1);
  if(!open) return;
  if(event.key==='Escape'){
    event.preventDefault(); event.stopImmediatePropagation();
    if(appDialogState.active){ finishAppDialog(false); return; }
    const cancel = open.querySelector('#metaCancel,#timingCancel,#previewClose,#settingsClose');
    cancel?.click();
    return;
  }
  if(event.key==='Tab'){
    const focusables = [...open.querySelectorAll('button:not(:disabled):not([hidden]),input:not(:disabled),select:not(:disabled),summary,[tabindex]:not([tabindex="-1"])')]
      .filter(node=>node.getClientRects().length>0);
    if(focusables.length){
      const first=focusables[0],last=focusables.at(-1);
      if(event.shiftKey && document.activeElement===first){ event.preventDefault();last.focus(); }
      else if(!event.shiftKey && document.activeElement===last){ event.preventDefault();first.focus(); }
    }
  }
},true);
