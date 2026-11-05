import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";
import { firebaseConfig, CONTROL_PATH, TRACKS_PATH } from "./reception-firebase-config.js";

const badge = document.getElementById("remoteControlBadge");
function setBadge(text, state) {
  badge.textContent = text;
  badge.dataset.state = state || "ready";
}

try {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  let firstSnapshot = true;
  let lastCommandId = "";

  onValue(ref(db, TRACKS_PATH), snapshot => {
    const remote = window.BGCReceptionPlayer;
    if (remote && remote.setCustomTracks) remote.setCustomTracks(snapshot.val() || {});
  }, error => {
    console.error("Firebase hymn library error:", error);
  });

  onValue(ref(db, CONTROL_PATH), snapshot => {
    setBadge("REMOTE CONTROL: READY", "ready");
    const command = snapshot.val();

    // Ignore the value already in the database when the TV receiver first connects.
    if (firstSnapshot) {
      firstSnapshot = false;
      lastCommandId = command && command.commandId ? command.commandId : "";
      return;
    }

    if (!command || !command.commandId || command.commandId === lastCommandId) return;
    lastCommandId = command.commandId;

    const remote = window.BGCReceptionPlayer;
    if (!remote) return;
    switch (command.action) {
      case "play": remote.play(); break;
      case "pause": remote.pause(); break;
      case "next": remote.next(); break;
      case "previous": remote.previous(); break;
      case "select": remote.select(command.trackId); break;
      case "selectUrl": remote.selectUrl(command.trackUrl); break;
      case "volume": remote.setVolume(command.volume); break;
    }
  }, error => {
    setBadge(error && error.code === "PERMISSION_DENIED" ?
      "REMOTE CONTROL: RULES REQUIRED" : "REMOTE CONTROL: CHECK CONNECTION", "error");
    console.error("Firebase receiver error:", error);
  });
} catch (error) {
  setBadge("REMOTE CONTROL: CONFIGURATION ERROR", "error");
  console.error(error);
}
