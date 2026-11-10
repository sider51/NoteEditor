const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../index.html'));
  const openLegacyChart = (event, payload) => {
    if(event.sender !== mainWindow.webContents || !payload || payload.data?.version !== 1) return;
    const oldWindow = new BrowserWindow({width:1280,height:800,parent:mainWindow,webPreferences:{nodeIntegration:true,contextIsolation:false}});
    oldWindow.loadFile(path.join(__dirname,'../old-editor/index.html'));
    oldWindow.webContents.once('did-finish-load',()=>oldWindow.webContents.send('legacy-chart',payload));
    const transfer=(reply,selection)=>{
      if(reply.sender===oldWindow.webContents)mainWindow.webContents.send('legacy-selection',selection);
    };
    ipcMain.on('legacy-selection',transfer);
    oldWindow.on('closed',()=>ipcMain.off('legacy-selection',transfer));
  };
  ipcMain.on('open-legacy-chart', openLegacyChart);
  mainWindow.on('closed',()=>ipcMain.off('open-legacy-chart',openLegacyChart));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

