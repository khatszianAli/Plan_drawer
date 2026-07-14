"use strict";

/** Application entry point. Keep this file last in index.html. */

bindUiActions();

const restored = restoreAutosave();
resizeCanvas();
if (!restored) resetView();
initializeHistory();
updateBuildSettingsUI();
updateModeUI();
updateSelectionUI();
updateZoomIndicator();
updateBackgroundSizeUI();
runValidation(false);
draw();
