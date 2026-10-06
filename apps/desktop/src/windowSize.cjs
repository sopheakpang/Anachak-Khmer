'use strict';

/**
 * Content size for the game window: 9:16, as tall as the work area allows (or a fixed
 * height from config/window.json), never wider than the work area.
 * @param {{width:number,height:number}} workArea
 * @param {number|'auto'} contentHeight
 * @returns {{width:number,height:number}}
 */
function windowSize(workArea, contentHeight) {
  let h = contentHeight === 'auto' ? workArea.height : Math.min(contentHeight, workArea.height);
  let w = Math.round((h * 9) / 16);
  if (w > workArea.width) {
    w = workArea.width;
    h = Math.round((w * 16) / 9);
  }
  return { width: w, height: h };
}

/**
 * Content size for the Kingdom tab (16:9, D51): as large as the work area allows.
 * @param {{width:number,height:number}} workArea
 * @returns {{width:number,height:number}}
 */
function landscapeSize(workArea) {
  let w = workArea.width;
  let h = Math.round((w * 9) / 16);
  if (h > workArea.height) {
    h = workArea.height;
    w = Math.round((h * 16) / 9);
  }
  return { width: w, height: h };
}

/** Pick the saved display if it is still connected, else a portrait display, else the primary. */
function pickDisplay(displays, primaryId, savedId) {
  const saved = displays.find((d) => d.id === savedId);
  if (saved) return saved;
  const portrait = displays.find((d) => d.workArea.height > d.workArea.width);
  if (portrait) return portrait;
  return displays.find((d) => d.id === primaryId) || displays[0];
}

module.exports = { windowSize, landscapeSize, pickDisplay };
