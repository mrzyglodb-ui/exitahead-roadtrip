/**
 * ExitAhead — Road Trip Next 5 Exits & Services Companion
 * Powered by OpenStreetMap (OSRM Highway Exit Engine + Photon POI Engine + Overpass Backup)
 * Zero API keys required • Works in any mobile or desktop browser
 */

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const PHOTON_REVERSE = "https://photon.komoot.io/reverse";

// Curated highway test corridors locked onto main interstate carriageways
const CORRIDOR_PRESETS = {
  i35_tx: {
    label: "I-35 North • Central Texas",
    lat: 30.6845,
    lon: -97.6686,
    heading: 16,
    speedMph: 72,
    expectedRef: "I 35"
  },
  i95_fl: {
    label: "I-95 South • Florida Space Coast",
    lat: 28.9856,
    lon: -80.9565,
    heading: 155,
    speedMph: 70,
    expectedRef: "I 95"
  },
  i70_co: {
    label: "I-70 West • Colorado Rockies",
    lat: 39.7412,
    lon: -105.5130,
    heading: 265,
    speedMph: 65,
    expectedRef: "I 70"
  },
  i80_ne: {
    label: "I-80 West • Nebraska",
    lat: 40.8189,
    lon: -97.5600,
    heading: 270,
    speedMph: 75,
    expectedRef: "I 80"
  },
  i5_ca: {
    label: "I-5 North • California Central Valley",
    lat: 36.6095,
    lon: -120.6258,
    heading: 328,
    speedMph: 70,
    expectedRef: "I 5"
  },
  i40_az: {
    label: "I-40 East • Northern Arizona",
    lat: 35.1858,
    lon: -111.6150,
    heading: 82,
    speedMph: 75,
    expectedRef: "I 40"
  }
};

// Application State
const state = {
  lat: CORRIDOR_PRESETS.i35_tx.lat,
  lon: CORRIDOR_PRESETS.i35_tx.lon,
  heading: CORRIDOR_PRESETS.i35_tx.heading,
  manualHeading: "auto",
  speedMph: CORRIDOR_PRESETS.i35_tx.speedMph,
  useMetric: false,
  isLiveGps: false,
  gpsWatchId: null,
  lastGpsFix: null,
  lastQueryPos: null,
  isSimulating: false,
  simIntervalId: null,
  followCar: true,
  activeFilter: "all",
  selectedExitId: null,
  detectedHighway: {
    ref: "I 35",
    name: "Interstate 35",
    type: "interstate",
    geometry: []
  },
  exits: [],
  isLoading: false
};

// DOM Elements
const els = {
  highwayShield: document.getElementById("highwayShield"),
  shieldType: document.getElementById("shieldType"),
  shieldNumber: document.getElementById("shieldNumber"),
  highwayName: document.getElementById("highwayName"),
  headingCompass: document.getElementById("headingCompass"),
  flipDirectionBtn: document.getElementById("flipDirectionBtn"),
  statusSubtitle: document.getElementById("statusSubtitle"),
  liveGpsBtn: document.getElementById("liveGpsBtn"),
  gpsBtnLabel: document.getElementById("gpsBtnLabel"),
  simDriveBtn: document.getElementById("simDriveBtn"),
  simBtnIcon: document.getElementById("simBtnIcon"),
  simBtnLabel: document.getElementById("simBtnLabel"),
  corridorPreset: document.getElementById("corridorPreset"),
  unitToggleBtn: document.getElementById("unitToggleBtn"),
  unitLabel: document.getElementById("unitLabel"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  themeIcon: document.getElementById("themeIcon"),
  speedValue: document.getElementById("speedValue"),
  speedUnit: document.getElementById("speedUnit"),
  headingDegrees: document.getElementById("headingDegrees"),
  recenterBtn: document.getElementById("recenterBtn"),
  refreshExitsBtn: document.getElementById("refreshExitsBtn"),
  toggleMapSizeBtn: document.getElementById("toggleMapSizeBtn"),
  mainWorkspace: document.querySelector(".main-workspace"),
  exitCountBadge: document.getElementById("exitCountBadge"),
  lastUpdatedText: document.getElementById("lastUpdatedText"),
  manualHeadingSelect: document.getElementById("manualHeadingSelect"),
  exitsList: document.getElementById("exitsList"),
  filterChips: document.querySelectorAll(".filter-chip"),
  locationSearchForm: document.getElementById("locationSearchForm"),
  locationSearchInput: document.getElementById("locationSearchInput"),
  gpsHelpModal: document.getElementById("gpsHelpModal"),
  closeGpsModalBtn: document.getElementById("closeGpsModalBtn"),
  retryGpsFromModalBtn: document.getElementById("retryGpsFromModalBtn"),
  useIpLocationBtn: document.getElementById("useIpLocationBtn"),
  gpsModalReason: document.getElementById("gpsModalReason")
};

// Leaflet Map & Layer References
let map = null;
let tileLayer = null;
let carMarker = null;
let exitMarkersLayer = null;
let routeLineLayer = null;
let activeFetchController = null;

// ==================== INITIALIZATION ====================
function initApp() {
  initMap();
  bindEvents();
  updateTelemetryUI();
  loadHighwayAndExits(true);
}

function initMap() {
  map = L.map("map", {
    center: [state.lat, state.lon],
    zoom: 11,
    zoomControl: false
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  setMapThemeTiles("dark");

  routeLineLayer = L.layerGroup().addTo(map);
  exitMarkersLayer = L.layerGroup().addTo(map);

  carMarker = L.marker([state.lat, state.lon], {
    icon: createCarIcon(getEffectiveHeading()),
    zIndexOffset: 1000
  }).addTo(map);

  map.on("dragstart", () => {
    state.followCar = false;
  });

  // Allow clicking anywhere on the map to reposition vehicle on any highway
  map.on("click", (e) => {
    if (state.isLiveGps) {
      stopLiveGps();
    }
    state.lat = e.latlng.lat;
    state.lon = e.latlng.lng;
    state.followCar = true;
    updateCarMarkerOnMap();
    loadHighwayAndExits(true);
  });
}

function setMapThemeTiles(theme) {
  if (tileLayer) {
    map.removeLayer(tileLayer);
  }
  tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const mapContainer = document.getElementById("map");
  if (theme === "dark") {
    mapContainer.style.filter = "brightness(0.88) contrast(1.08) saturate(0.95)";
  } else {
    mapContainer.style.filter = "none";
  }
}

function createCarIcon(headingDeg) {
  return L.divIcon({
    className: "car-marker-wrap",
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    html: `
      <div class="car-puck" style="transform: rotate(${Math.round(headingDeg)}deg)" title="Your Vehicle">
        ▲
      </div>
    `
  });
}

function bindEvents() {
  els.liveGpsBtn.addEventListener("click", () => {
    if (state.isLiveGps) {
      stopLiveGps();
    } else {
      startLiveGps();
    }
  });

  els.simDriveBtn.addEventListener("click", () => {
    toggleSimulatedDrive();
  });

  if (els.locationSearchForm) {
    els.locationSearchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = (els.locationSearchInput.value || "").trim();
      if (query) {
        searchLocationAndJump(query);
      }
    });
  }

  if (els.closeGpsModalBtn) {
    els.closeGpsModalBtn.addEventListener("click", () => {
      els.gpsHelpModal.hidden = true;
    });
  }

  if (els.retryGpsFromModalBtn) {
    els.retryGpsFromModalBtn.addEventListener("click", () => {
      els.gpsHelpModal.hidden = true;
      startLiveGps();
    });
  }

  if (els.useIpLocationBtn) {
    els.useIpLocationBtn.addEventListener("click", () => {
      els.gpsHelpModal.hidden = true;
      fallbackToNetworkLocation();
    });
  }

  els.corridorPreset.addEventListener("change", (e) => {
    const key = e.target.value;
    const preset = CORRIDOR_PRESETS[key];
    if (!preset) return;
    if (state.isLiveGps) stopLiveGps();
    state.lat = preset.lat;
    state.lon = preset.lon;
    state.heading = preset.heading;
    state.speedMph = preset.speedMph;
    state.manualHeading = "auto";
    els.manualHeadingSelect.value = "auto";
    state.followCar = true;
    updateCarMarkerOnMap(true);
    updateTelemetryUI();
    loadHighwayAndExits(true);
  });

  els.flipDirectionBtn.addEventListener("click", () => {
    const flipped = (getEffectiveHeading() + 180) % 360;
    state.heading = flipped;
    if (state.manualHeading !== "auto") {
      state.manualHeading = String(Math.round(flipped));
    }
    updateCarMarkerOnMap();
    updateTelemetryUI();
    loadHighwayAndExits(true);
  });

  els.manualHeadingSelect.addEventListener("change", (e) => {
    state.manualHeading = e.target.value;
    if (state.manualHeading !== "auto") {
      state.heading = Number(state.manualHeading);
    }
    updateCarMarkerOnMap();
    updateTelemetryUI();
    loadHighwayAndExits(true);
  });

  els.unitToggleBtn.addEventListener("click", () => {
    state.useMetric = !state.useMetric;
    els.unitLabel.textContent = state.useMetric ? "KM" : "MI";
    updateTelemetryUI();
    renderExitsList();
    renderMapExitMarkers();
  });

  els.themeToggleBtn.addEventListener("click", () => {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    els.themeIcon.textContent = next === "dark" ? "☀️" : "🌙";
    setMapThemeTiles(next);
  });

  els.recenterBtn.addEventListener("click", () => {
    state.followCar = true;
    fitMapToCarAndExits();
  });

  els.refreshExitsBtn.addEventListener("click", () => {
    loadHighwayAndExits(true);
  });

  els.toggleMapSizeBtn.addEventListener("click", () => {
    els.mainWorkspace.classList.toggle("map-expanded");
    const expanded = els.mainWorkspace.classList.contains("map-expanded");
    els.toggleMapSizeBtn.textContent = expanded ? "↕ Shrink Map" : "↕ Expand Map";
    setTimeout(() => map.invalidateSize(), 220);
  });

  els.filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      els.filterChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.activeFilter = chip.getAttribute("data-filter");
      renderExitsList();
    });
  });
}

// ==================== LIVE GPS, NETWORK LOCATION & SEARCH ====================
function handleGpsFix(pos) {
  const { latitude, longitude, heading, speed } = pos.coords;

  if (typeof heading === "number" && !Number.isNaN(heading) && speed && speed > 1.5) {
    state.heading = heading;
  } else if (state.lastGpsFix) {
    const movedMeters = haversineMeters(
      state.lastGpsFix.lat,
      state.lastGpsFix.lon,
      latitude,
      longitude
    );
    if (movedMeters > 12) {
      state.heading = computeBearing(
        state.lastGpsFix.lat,
        state.lastGpsFix.lon,
        latitude,
        longitude
      );
    }
  }

  if (typeof speed === "number" && !Number.isNaN(speed) && speed >= 0) {
    state.speedMph = Math.max(0, Math.round(speed * 2.23694));
  }

  state.lat = latitude;
  state.lon = longitude;
  state.lastGpsFix = { lat: latitude, lon: longitude };

  updateCarMarkerOnMap(state.followCar);
  updateTelemetryUI();
  recalculateExitDistances();

  const distSinceQuery = state.lastQueryPos
    ? haversineMeters(state.lastQueryPos.lat, state.lastQueryPos.lon, latitude, longitude)
    : Infinity;

  if (distSinceQuery > 1500) {
    loadHighwayAndExits(true);
  }
}

function handleGpsError(err) {
  console.warn("GPS error:", err);
  stopLiveGps();

  const isInsecure = !window.isSecureContext && location.hostname !== "localhost";
  if (isInsecure && els.gpsModalReason) {
    els.gpsModalReason.innerHTML =
      'You are viewing an unencrypted <code>http://</code> or <code>file://</code> address. Browsers silently block GPS unless you open the <strong>https://</strong> link (e.g. your Vercel or GitHub Pages URL).';
  } else if (err.code === 1 && els.gpsModalReason) {
    els.gpsModalReason.innerHTML =
      'Your phone or computer returned <strong>"User denied Geolocation"</strong> without asking. This happens when Location Services is turned off for Safari/Chrome in your device Settings, or Location is set to "Block" in the address bar.';
  }

  if (els.gpsHelpModal) {
    els.gpsHelpModal.hidden = false;
  }
  els.statusSubtitle.textContent = `GPS blocked (${err.message}) — see fix options or use Search`;
}

function startLiveGps() {
  if (!("geolocation" in navigator)) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  if (state.isSimulating) {
    toggleSimulatedDrive(false);
  }

  state.isLiveGps = true;
  state.followCar = true;
  state.lastQueryPos = null; // Force immediate highway scan on first GPS fix
  els.liveGpsBtn.classList.add("active");
  els.gpsBtnLabel.textContent = "Live GPS Active";
  els.statusSubtitle.textContent = "Requesting GPS location...";

  // Step 1: Request an immediate fix inside the user tap gesture (fixes iOS Safari prompt behavior)
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      handleGpsFix(pos);
      // Step 2: Start continuous watchPosition once permission is confirmed
      if (state.gpsWatchId !== null) {
        navigator.geolocation.clearWatch(state.gpsWatchId);
      }
      state.gpsWatchId = navigator.geolocation.watchPosition(
        handleGpsFix,
        (watchErr) => {
          console.warn("Watch GPS warning:", watchErr);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 4000,
          timeout: 15000
        }
      );
    },
    (err) => {
      // If high-accuracy GPS timed out indoors, try standard network/Wi-Fi geolocation before giving up
      if (err.code === 3 || err.code === 2) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            handleGpsFix(pos);
          },
          handleGpsError,
          { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 }
        );
      } else {
        handleGpsError(err);
      }
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    }
  );
}

function stopLiveGps() {
  if (state.gpsWatchId !== null) {
    navigator.geolocation.clearWatch(state.gpsWatchId);
    state.gpsWatchId = null;
  }
  state.isLiveGps = false;
  els.liveGpsBtn.classList.remove("active");
  els.gpsBtnLabel.textContent = "Use Live GPS";
}

async function fallbackToNetworkLocation() {
  els.statusSubtitle.textContent = "Finding your approximate area via network...";
  try {
    const res = await fetch("https://get.geojs.io/v1/ip/geo.json");
    if (!res.ok) throw new Error("Network geo lookup failed");
    const data = await res.json();
    const lat = parseFloat(data.latitude);
    const lon = parseFloat(data.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      state.lat = lat;
      state.lon = lon;
      state.followCar = true;
      updateCarMarkerOnMap(true);
      els.statusSubtitle.textContent = `Located near ${data.city || "your area"}, ${data.region || ""} • Tap map highway to refine`;
      loadHighwayAndExits(true);
    }
  } catch (err) {
    console.warn("Network location error:", err);
    els.statusSubtitle.textContent = "Could not detect network location — use the Search box above";
  }
}

async function searchLocationAndJump(queryText) {
  els.statusSubtitle.textContent = `Searching for "${queryText}"...`;
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(queryText)}&limit=1`
    );
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    const feat = data.features && data.features[0];
    if (!feat || !feat.geometry?.coordinates) {
      els.statusSubtitle.textContent = `No match found for "${queryText}"`;
      return;
    }
    if (state.isLiveGps) stopLiveGps();
    state.lon = feat.geometry.coordinates[0];
    state.lat = feat.geometry.coordinates[1];
    state.followCar = true;
    updateCarMarkerOnMap(true);
    loadHighwayAndExits(true);
  } catch (err) {
    console.warn("Search error:", err);
    els.statusSubtitle.textContent = "Location search failed — try clicking on the map";
  }
}

function toggleSimulatedDrive(forceState) {
  const nextState = typeof forceState === "boolean" ? forceState : !state.isSimulating;

  if (!nextState) {
    clearInterval(state.simIntervalId);
    state.simIntervalId = null;
    state.isSimulating = false;
    els.simDriveBtn.classList.remove("active");
    els.simBtnIcon.textContent = "▶";
    els.simBtnLabel.textContent = "Demo Drive";
    return;
  }

  if (state.isLiveGps) {
    stopLiveGps();
  }

  state.isSimulating = true;
  if (state.speedMph < 45) state.speedMph = 70;
  els.simDriveBtn.classList.add("active");
  els.simBtnIcon.textContent = "⏸";
  els.simBtnLabel.textContent = "Driving...";

  state.simIntervalId = setInterval(() => {
    let targetBearing = getEffectiveHeading();
    if (state.exits.length > 0) {
      const firstExit = state.exits[0];
      const distToFirst = haversineMeters(state.lat, state.lon, firstExit.lat, firstExit.lon);
      if (distToFirst > 200) {
        targetBearing = computeBearing(state.lat, state.lon, firstExit.lat, firstExit.lon);
        state.heading = targetBearing;
      }
    }

    const nextPt = moveAlongBearing(state.lat, state.lon, targetBearing, 160);
    state.lat = nextPt.lat;
    state.lon = nextPt.lon;

    updateCarMarkerOnMap(state.followCar);
    updateTelemetryUI();
    recalculateExitDistances();

    const distSinceQuery = state.lastQueryPos
      ? haversineMeters(state.lastQueryPos.lat, state.lastQueryPos.lon, state.lat, state.lon)
      : Infinity;

    if (distSinceQuery > 5000 || state.exits.length < 3) {
      loadHighwayAndExits(false);
    }
  }, 1200);
}

// ==================== HIGHWAY & NEXT 5 EXITS ENGINE ====================
async function loadHighwayAndExits(showFullLoader = true) {
  if (activeFetchController) {
    activeFetchController.abort();
  }
  activeFetchController = new AbortController();
  const { signal } = activeFetchController;

  state.isLoading = true;
  state.lastQueryPos = { lat: state.lat, lon: state.lon };

  if (showFullLoader) {
    renderLoadingState("Scanning highway corridor & next 5 exits ahead...");
  } else {
    els.lastUpdatedText.textContent = "Updating upcoming exits & services...";
  }

  try {
    const heading = getEffectiveHeading();

    // 1. Project a destination ~30 miles (48 km) ahead along current heading and query OSRM
    const aheadPt = moveAlongBearing(state.lat, state.lon, heading, 48000);
    const routeUrl = `${OSRM_BASE}/${state.lon.toFixed(6)},${state.lat.toFixed(6)};${aheadPt.lon.toFixed(6)},${aheadPt.lat.toFixed(6)}?steps=true&overview=full&geometries=geojson&bearings=${Math.round(heading)},75;`;

    const routeRes = await fetch(routeUrl, { signal });
    if (!routeRes.ok) throw new Error(`Routing HTTP ${routeRes.status}`);
    const routeData = await routeRes.json();

    const route = routeData.routes && routeData.routes[0];
    if (!route || !route.legs || !route.legs[0]) {
      throw new Error("No highway route found ahead");
    }

    const steps = route.legs[0].steps || [];

    // Identify primary highway steps (steps with a highway ref or major road name)
    let highwaySteps = steps.filter(
      (s) =>
        (s.ref && s.ref.trim() !== "") ||
        /interstate|freeway|expressway|turnpike|parkway|highway|motorway/i.test(s.name || "")
    );

    if (highwaySteps.length === 0) {
      // Fallback to longest steps if user is on an unnumbered major road
      highwaySteps = steps.filter((s) => s.distance > 500);
    }

    const primaryStep = highwaySteps[0] || steps[0] || {};
    const detectedRef = normalizeHighwayRef(primaryStep.ref || "");
    const detectedName =
      primaryStep.name ||
      (detectedRef ? formatHighwayFullName(detectedRef) : "Highway Corridor");

    // Extract polyline geometry for map highlight
    const routeGeoLatLngs = (route.geometry?.coordinates || []).map((c) => [c[1], c[0]]);

    state.detectedHighway = {
      ref: detectedRef || "HWY",
      name: detectedName,
      type: classifyHighwayType(detectedRef),
      geometry: routeGeoLatLngs
    };

    // Snap heading to the highway step initial bearing if in auto mode
    if (
      state.manualHeading === "auto" &&
      typeof primaryStep.maneuver?.bearing_after === "number" &&
      haversineMeters(
        state.lat,
        state.lon,
        primaryStep.maneuver.location[1],
        primaryStep.maneuver.location[0]
      ) < 600
    ) {
      state.heading = primaryStep.maneuver.bearing_after;
    }

    // 2. Collect candidate outgoing exit ramp intersections along the highway steps
    const rawRamps = [];
    for (const st of highwaySteps) {
      // If we locked onto an Interstate/US Highway ref, stay on steps matching that corridor
      if (detectedRef && st.ref && !sharesHighwayRef(detectedRef, st.ref)) {
        continue;
      }

      const intersections = st.intersections || [];
      for (const inter of intersections) {
        if (!Array.isArray(inter.entry) || !Array.isArray(inter.bearings)) continue;

        const trueEntries = inter.entry.filter(Boolean).length;
        if (trueEntries < 2) continue;

        // Find the outgoing ramp bearing (an allowed entry index != inter.out)
        let rampIdx = -1;
        for (let i = 0; i < inter.entry.length; i++) {
          if (inter.entry[i] === true && i !== inter.out) {
            rampIdx = i;
            break;
          }
        }
        if (rampIdx === -1) continue;

        const rampLon = inter.location[0];
        const rampLat = inter.location[1];
        const distMeters = haversineMeters(state.lat, state.lon, rampLat, rampLon);
        if (distMeters < 180) continue; // Already passed

        rawRamps.push({
          lat: rampLat,
          lon: rampLon,
          distMeters,
          rampBearing: inter.bearings[rampIdx],
          highwayBearing: inter.bearings[inter.out] ?? state.heading,
          highwayRef: normalizeHighwayRef(st.ref || detectedRef),
          highwayName: st.name || detectedName
        });
      }
    }

    rawRamps.sort((a, b) => a.distMeters - b.distMeters);

    // Filter out closely-spaced duplicate ramp nodes (< 380m apart) before probing
    const distinctRamps = [];
    for (const rmp of rawRamps) {
      const tooClose = distinctRamps.some(
        (existing) => haversineMeters(existing.lat, existing.lon, rmp.lat, rmp.lon) < 380
      );
      if (!tooClose) {
        distinctRamps.push(rmp);
      }
      if (distinctRamps.length >= 8) break;
    }

    // 3. Probe each candidate exit ramp (65m down the ramp) in parallel to get exact Exit Number & Green Sign Destination
    const probedRamps = await Promise.all(
      distinctRamps.map((rmp, idx) => probeRampSignage(rmp, idx + 1, signal))
    );

    // Deduplicate exits that share the same exit number or same destination within 1200m
    const finalExits = [];
    for (const ex of probedRamps) {
      if (!ex) continue;
      const dup = finalExits.find((existing) => {
        const gap = haversineMeters(existing.lat, existing.lon, ex.lat, ex.lon);
        if (existing.ref && ex.ref && existing.ref === ex.ref && gap < 1600) return true;
        if (
          existing.title &&
          ex.title &&
          existing.title.toLowerCase() === ex.title.toLowerCase() &&
          gap < 1400
        ) {
          return true;
        }
        return false;
      });

      if (!dup) {
        finalExits.push(ex);
      }
      if (finalExits.length >= 5) break;
    }

    state.exits = finalExits;
    state.isLoading = false;

    updateHeaderHighwayUI();
    updateTelemetryUI();
    updateCarMarkerOnMap();
    renderExitsList();
    renderMapExitMarkers();

    if (state.followCar && showFullLoader) {
      fitMapToCarAndExits();
    }

    // 4. Fetch nearby Services (Gas, Food, Hotel, EV, Rest Area) in parallel for all 5 exits via Photon
    if (state.exits.length > 0) {
      els.lastUpdatedText.textContent = `Found ${state.exits.length} upcoming exits • Loading nearby gas, food & hotels...`;
      await Promise.all(state.exits.map((ex) => enrichSingleExitWithPhoton(ex, signal)));
      renderExitsList();
      renderMapExitMarkers();
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      els.lastUpdatedText.textContent = `Live OpenStreetMap data • Updated ${timeStr}`;
    } else {
      els.lastUpdatedText.textContent = "No exits detected ahead in this direction";
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    console.warn("Highway lookup error:", err);
    state.isLoading = false;
    renderErrorState(err.message);
  }
}

/**
 * Probes 70 meters down an outgoing exit ramp using OSRM to extract:
 * - Official Exit Number (`exits`, e.g., "274")
 * - Official Highway Sign Destination (`destinations`, e.g., "FM 487: Florence, Bartlett")
 * - Ramp or cross-street name
 */
async function probeRampSignage(rmp, fallbackSeq, signal) {
  try {
    const pt2 = moveAlongBearing(rmp.lat, rmp.lon, rmp.rampBearing, 72);
    const b = Math.round(rmp.rampBearing);
    const url = `${OSRM_BASE}/${rmp.lon.toFixed(6)},${rmp.lat.toFixed(6)};${pt2.lon.toFixed(6)},${pt2.lat.toFixed(6)}?steps=true&overview=false&bearings=${b},45;${b},80`;

    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error("Ramp probe failed");
    const data = await res.json();
    const steps = data.routes?.[0]?.legs?.[0]?.steps || [];
    const st0 = steps[0] || {};
    const st1 = steps[1] || {};

    const exitRef = cleanExitRef(st0.exits || st1.exits || "");
    const rawDest = st0.destinations || st1.destinations || "";
    const rawName = st0.name || st1.name || "";
    const rawRef = st0.ref || st1.ref || "";

    let title = "";
    let subtitle = "";

    if (rawDest) {
      const parts = rawDest.split(":").map((s) => s.trim());
      if (parts.length >= 2) {
        title = parts.slice(1).join(" / ").replace(/;/g, " • ");
        subtitle = `Toward ${parts[0].replace(/;/g, " / ")}`;
      } else {
        title = rawDest.replace(/;/g, " / ");
      }
    } else if (rawName && !sharesHighwayRef(rawName, rmp.highwayName)) {
      title = rawName;
      if (rawRef) subtitle = rawRef;
    } else if (rawRef && !sharesHighwayRef(rawRef, rmp.highwayRef)) {
      title = rawRef;
    } else {
      title = exitRef ? `Exit ${exitRef}` : "Highway Interchange";
    }

    return {
      id: Math.round(rmp.lat * 1e5) + fallbackSeq,
      lat: rmp.lat,
      lon: rmp.lon,
      ref: exitRef,
      title,
      subtitle,
      highwayRef: rmp.highwayRef,
      highwayName: rmp.highwayName,
      distMeters: rmp.distMeters,
      services: {
        gas: [],
        food: [],
        hotel: [],
        ev: [],
        rest: []
      }
    };
  } catch (e) {
    if (e.name === "AbortError") throw e;
    return {
      id: Math.round(rmp.lat * 1e5) + fallbackSeq,
      lat: rmp.lat,
      lon: rmp.lon,
      ref: "",
      title: "Highway Exit",
      subtitle: "",
      highwayRef: rmp.highwayRef,
      highwayName: rmp.highwayName,
      distMeters: rmp.distMeters,
      services: {
        gas: [],
        food: [],
        hotel: [],
        ev: [],
        rest: []
      }
    };
  }
}

/**
 * Queries Photon (OpenStreetMap geocoder/POI engine) within 1.45km of an exit
 * to populate Gas, Food, Hotel, EV Charging, and Rest Area / Truck Stop services,
 * and also refines generic exit titles if a local cross-street is found.
 */
async function enrichSingleExitWithPhoton(exitObj, signal) {
  const url = `${PHOTON_REVERSE}?lat=${exitObj.lat.toFixed(5)}&lon=${exitObj.lon.toFixed(5)}&radius=1.45&limit=38&osm_tag=amenity&osm_tag=tourism&osm_tag=shop&osm_tag=highway`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return;
    const data = await res.json();
    const features = data.features || [];

    const buckets = { gas: [], food: [], hotel: [], ev: [], rest: [] };
    let fallbackStreet = "";

    for (const feat of features) {
      const props = feat.properties || {};
      const coords = feat.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;

      const poiLon = coords[0];
      const poiLat = coords[1];
      const distFromExitMeters = Math.round(
        haversineMeters(exitObj.lat, exitObj.lon, poiLat, poiLon)
      );

      if (
        !fallbackStreet &&
        props.street &&
        !/interstate|freeway|i-\d+|i \d+/i.test(props.street)
      ) {
        fallbackStreet = props.street;
      }

      const cat = classifyPhotonFeature(props);
      if (!cat) continue;

      const name = formatPhotonPoiName(props, cat);
      if (!name) continue;

      const exists = buckets[cat].some((item) => item.name.toLowerCase() === name.toLowerCase());
      if (!exists) {
        buckets[cat].push({
          id: props.osm_id || Math.random(),
          name,
          lat: poiLat,
          lon: poiLon,
          distFromExitMeters
        });
      }
    }

    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => a.distFromExitMeters - b.distFromExitMeters);
      exitObj.services[key] = buckets[key].slice(0, 8);
    }

    // If exit title was generic, upgrade it with discovered cross-street or locality
    if (
      (exitObj.title === "Highway Interchange" ||
        exitObj.title === "Highway Exit" ||
        exitObj.title.startsWith("Exit ")) &&
      fallbackStreet
    ) {
      exitObj.title = fallbackStreet;
    }
  } catch (err) {
    if (err.name === "AbortError") throw err;
  }
}

function classifyPhotonFeature(props) {
  const key = props.osm_key || "";
  const val = props.osm_value || "";
  const name = (props.name || "").toLowerCase();

  if (val === "fuel") return "gas";
  if (val === "charging_station") return "ev";
  if (
    val === "fast_food" ||
    val === "restaurant" ||
    val === "cafe" ||
    val === "bakery" ||
    val === "ice_cream"
  ) {
    return "food";
  }
  if (
    val === "hotel" ||
    val === "motel" ||
    val === "guest_house" ||
    val === "hostel" ||
    val === "caravan_site" ||
    val === "camp_site"
  ) {
    return "hotel";
  }
  if (
    val === "rest_area" ||
    val === "services" ||
    val === "toilets" ||
    val === "hospital" ||
    val === "clinic" ||
    val === "pharmacy"
  ) {
    return "rest";
  }

  if (key === "shop" && (val === "convenience" || val === "supermarket" || val === "gas")) {
    if (
      /shell|exxon|chevron|texaco|mobil|bp|valero|sunoco|arco|circle k|7-eleven|love's|pilot|flying j|buc-ee|wawa|sheetz|quiktrip|qt|casey|kwik trip|speedway|racetrac|maverik|cefco|stripes|star mart|qmart|mart|fuel|truck|travel|petro|ta |sinclair|conoco|phillips|citgo|marathon|murphy|allsup|kum & go|royal farms/.test(
        name
      )
    ) {
      return "gas";
    }
  }

  return null;
}

function formatPhotonPoiName(props, category) {
  const rawName = (props.name || "").trim();
  if (rawName) {
    // Clean store numbers like "Chevron # 377999" -> "Chevron"
    return rawName.replace(/\s*#\s*\d+.*$/, "").trim();
  }
  if (category === "rest") {
    if (props.osm_value === "rest_area") return "Highway Rest Area";
    if (props.osm_value === "services") return "Travel Plaza";
    if (props.osm_value === "toilets") return "Public Restrooms";
  }
  if (category === "ev") return "EV Charging";
  return null;
}

// ==================== UI RENDERING ====================
function updateHeaderHighwayUI() {
  const { ref, name, type } = state.detectedHighway;
  els.highwayShield.className = "highway-shield";
  if (type === "us") {
    els.highwayShield.classList.add("us-route");
    els.shieldType.textContent = "US";
  } else if (type === "state") {
    els.highwayShield.classList.add("state-route");
    els.shieldType.textContent = ref.split(" ")[0] || "STATE";
  } else {
    els.shieldType.textContent = "INTERSTATE";
  }

  const numPart = ref.replace(/^[A-Z]+\s*-?\s*/i, "").trim() || "--";
  els.shieldNumber.textContent = numPart.slice(0, 5);
  els.highwayName.textContent = name || "Highway Corridor";

  const cardinal = degreesToCardinal(getEffectiveHeading());
  els.headingCompass.textContent = cardinal;
  els.statusSubtitle.textContent = state.isLiveGps
    ? `Live GPS tracking • ${cardinal}-bound`
    : `Tracking ${cardinal}-bound along ${ref || "corridor"}`;
}

function updateTelemetryUI() {
  const heading = getEffectiveHeading();
  const cardinal = degreesToCardinal(heading);
  const paddedDeg = String(Math.round(heading)).padStart(3, "0");
  els.headingDegrees.textContent = `${paddedDeg}° ${cardinal}`;
  els.headingCompass.textContent = cardinal;

  if (state.useMetric) {
    els.speedValue.textContent = Math.round(state.speedMph * 1.60934);
    els.speedUnit.textContent = "KM/H";
  } else {
    els.speedValue.textContent = Math.round(state.speedMph);
    els.speedUnit.textContent = "MPH";
  }
}

function recalculateExitDistances() {
  if (!state.exits.length) return;
  for (const ex of state.exits) {
    ex.distMeters = haversineMeters(state.lat, state.lon, ex.lat, ex.lon);
  }
  const heading = getEffectiveHeading();
  state.exits = state.exits.filter((ex) => {
    const brg = computeBearing(state.lat, state.lon, ex.lat, ex.lon);
    return angularDifference(heading, brg) <= 95 && ex.distMeters > 80;
  });
  renderExitsList();
  renderMapExitMarkers();
}

function updateFilterCounts() {
  const counts = { gas: 0, food: 0, hotel: 0, ev: 0, rest: 0 };
  for (const ex of state.exits) {
    for (const cat of Object.keys(counts)) {
      if (ex.services[cat] && ex.services[cat].length > 0) {
        counts[cat]++;
      }
    }
  }
  for (const cat of Object.keys(counts)) {
    const badge = document.querySelector(`[data-count-for="${cat}"]`);
    if (badge) badge.textContent = counts[cat];
  }
  els.exitCountBadge.textContent = state.exits.length;
}

function renderExitsList() {
  updateFilterCounts();

  const filteredExits = state.exits.filter((ex) => {
    if (state.activeFilter === "all") return true;
    return ex.services[state.activeFilter] && ex.services[state.activeFilter].length > 0;
  });

  if (filteredExits.length === 0) {
    if (state.isLoading) return;
    els.exitsList.innerHTML = `
      <div class="state-card">
        <p style="font-weight:700; font-size:0.95rem; margin-bottom:6px;">
          ${
            state.activeFilter === "all"
              ? "No upcoming highway exits found ahead"
              : `None of the next ${state.exits.length} exits have ${state.activeFilter.toUpperCase()} listed`
          }
        </p>
        <p style="font-size:0.82rem; color:var(--text-muted);">
          ${
            state.activeFilter === "all"
              ? "Try flipping the travel direction (180°), selecting another highway corridor, or clicking directly on a highway on the map."
              : 'Click "All Exits" above to view all upcoming exits.'
          }
        </p>
      </div>
    `;
    return;
  }

  els.exitsList.innerHTML = filteredExits
    .map((ex) => {
      const rank = state.exits.indexOf(ex) + 1;
      const distStr = formatDistance(ex.distMeters);
      const etaStr = formatEta(ex.distMeters, state.speedMph);
      const exitLabel = ex.ref ? `EXIT ${escapeHtml(ex.ref)}` : `EXIT #${rank}`;
      const isSelected = state.selectedExitId === ex.id;

      const serviceCategories = [
        { key: "gas", icon: "⛽", label: "Gas", css: "cat-gas" },
        { key: "food", icon: "🍔", label: "Food", css: "cat-food" },
        { key: "hotel", icon: "🏨", label: "Lodging", css: "cat-hotel" },
        { key: "ev", icon: "⚡", label: "EV", css: "cat-ev" },
        { key: "rest", icon: "🚻", label: "Rest", css: "cat-rest" }
      ];

      const nonEmptyRows = serviceCategories
        .filter((cat) => ex.services[cat.key] && ex.services[cat.key].length > 0)
        .map((cat) => {
          const pillsHtml = ex.services[cat.key]
            .map((poi) => {
              const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lon}`;
              const subDist = formatShortRampDistance(poi.distFromExitMeters);
              return `
                <a href="${gmapsUrl}" target="_blank" rel="noopener" class="poi-pill" onclick="event.stopPropagation()" title="Navigate to ${escapeHtml(poi.name)}">
                  <span>${escapeHtml(poi.name)}</span>
                  <span class="poi-dist-tag">${subDist}</span>
                </a>
              `;
            })
            .join("");

          return `
            <div class="service-row">
              <span class="service-cat-label ${cat.css}">${cat.icon} ${cat.label}</span>
              <div class="poi-pills-wrap">${pillsHtml}</div>
            </div>
          `;
        })
        .join("");

      const servicesHtml =
        nonEmptyRows ||
        `
        <div class="no-services-note">
          <span>Rural exit — no commercial services mapped within 0.8 mi of ramp</span>
        </div>
      `;

      const exitMapsUrl = `https://www.google.com/maps/search/?api=1&query=${ex.lat},${ex.lon}`;

      return `
        <article class="exit-card ${isSelected ? "active-card" : ""}" data-exit-id="${ex.id}">
          <div class="exit-sign-banner">
            <div class="exit-sign-left">
              <span class="exit-sequence-num">#${rank}</span>
              <span class="exit-tab-badge">${exitLabel}</span>
              <div class="exit-destination-group">
                <div class="exit-title">${escapeHtml(ex.title)}</div>
                ${ex.subtitle ? `<div class="exit-road-sub">${escapeHtml(ex.subtitle)}</div>` : ""}
              </div>
            </div>
            <div class="exit-distance-box">
              <div class="exit-distance-val">${distStr}</div>
              <div class="exit-eta-val">${etaStr}</div>
            </div>
          </div>

          <div class="exit-services-body">
            ${servicesHtml}
          </div>

          <div class="exit-card-footer">
            <span>Tap card to spotlight on map • Tap any business for directions</span>
            <a href="${exitMapsUrl}" target="_blank" rel="noopener" class="nav-link-btn" onclick="event.stopPropagation()">
              Open Exit in Maps ↗
            </a>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".exit-card").forEach((card) => {
    card.addEventListener("click", () => {
      const exitId = Number(card.getAttribute("data-exit-id"));
      focusExitOnMap(exitId);
    });
  });
}

function renderLoadingState(msg) {
  els.exitsList.innerHTML = `
    <div class="state-card">
      <div class="spinner"></div>
      <p style="font-weight:600;">${escapeHtml(msg)}</p>
      <p style="font-size:0.78rem; color:var(--text-muted); margin-top:4px;">
        Calculating upcoming highway exits &amp; nearby businesses...
      </p>
    </div>
  `;
}

function renderErrorState(errMsg) {
  els.exitsList.innerHTML = `
    <div class="state-card">
      <p style="font-weight:700; color:#f87171; margin-bottom:6px;">Could not load highway route</p>
      <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:12px;">${escapeHtml(errMsg)}</p>
      <button class="btn btn-gps" onclick="loadHighwayAndExits(true)">🔄 Retry Now</button>
    </div>
  `;
}

// ==================== MAP MARKERS & CAMERA ====================
function updateCarMarkerOnMap(panToCar = false) {
  if (!carMarker) return;
  carMarker.setLatLng([state.lat, state.lon]);
  carMarker.setIcon(createCarIcon(getEffectiveHeading()));
  if (panToCar) {
    map.panTo([state.lat, state.lon], { animate: true });
  }
}

function renderMapExitMarkers() {
  if (!exitMarkersLayer || !routeLineLayer) return;
  exitMarkersLayer.clearLayers();
  routeLineLayer.clearLayers();

  if (state.exits.length === 0) return;

  // Draw highlighted highway route geometry ahead
  const hwyGeom = state.detectedHighway.geometry || [];
  if (hwyGeom.length >= 2) {
    L.polyline(hwyGeom, {
      color: "#10b981",
      weight: 5,
      opacity: 0.78
    }).addTo(routeLineLayer);
  } else {
    const pathCoords = [
      [state.lat, state.lon],
      ...state.exits.map((ex) => [ex.lat, ex.lon])
    ];
    L.polyline(pathCoords, {
      color: "#10b981",
      weight: 5,
      opacity: 0.75,
      dashArray: "10, 8"
    }).addTo(routeLineLayer);
  }

  state.exits.forEach((ex, index) => {
    const rank = index + 1;
    const isSelected = state.selectedExitId === ex.id;
    const exitLabel = ex.ref ? `EXIT ${escapeHtml(ex.ref)}` : `EXIT #${rank}`;
    const distStr = formatDistance(ex.distMeters);

    const icon = L.divIcon({
      className: "exit-pin-wrapper",
      iconSize: [118, 28],
      iconAnchor: [59, 14],
      html: `
        <div class="exit-map-pin ${isSelected ? "selected" : ""}">
          <span class="pin-rank">#${rank}</span>
          <span>${exitLabel}</span>
          <span style="color:#fde047;">${distStr}</span>
        </div>
      `
    });

    const marker = L.marker([ex.lat, ex.lon], { icon }).addTo(exitMarkersLayer);

    const gasList = ex.services.gas.map((p) => p.name).slice(0, 4).join(", ") || "None listed";
    const foodList = ex.services.food.map((p) => p.name).slice(0, 4).join(", ") || "None listed";
    const hotelList = ex.services.hotel.map((p) => p.name).slice(0, 3).join(", ") || "None listed";

    marker.bindPopup(`
      <div style="font-family:Inter,sans-serif; min-width:210px;">
        <div style="background:#006b3f; color:#fff; padding:6px 10px; border-radius:6px; font-weight:800; margin-bottom:6px;">
          #${rank} • ${exitLabel} (${distStr})
        </div>
        <div style="font-weight:700; font-size:13px; margin-bottom:6px; color:#0f172a;">
          ${escapeHtml(ex.title)}
        </div>
        <div style="font-size:12px; color:#334155; line-height:1.45;">
          <div><strong>⛽ Gas:</strong> ${escapeHtml(gasList)}</div>
          <div><strong>🍔 Food:</strong> ${escapeHtml(foodList)}</div>
          <div><strong>🏨 Lodging:</strong> ${escapeHtml(hotelList)}</div>
        </div>
      </div>
    `);

    marker.on("click", () => {
      state.selectedExitId = ex.id;
      renderExitsList();
      const cardEl = document.querySelector(`.exit-card[data-exit-id="${ex.id}"]`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  });
}

function focusExitOnMap(exitId) {
  state.selectedExitId = exitId;
  state.followCar = false;
  renderExitsList();
  renderMapExitMarkers();

  const target = state.exits.find((e) => e.id === exitId);
  if (target) {
    map.flyTo([target.lat, target.lon], 14, { duration: 0.7 });
  }
}

function fitMapToCarAndExits() {
  if (!map) return;
  const pts = [[state.lat, state.lon], ...state.exits.map((e) => [e.lat, e.lon])];
  if (pts.length === 1) {
    map.setView([state.lat, state.lon], 12);
  } else {
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 13 });
  }
}

// ==================== GEOMETRY & SIGNAGE HELPERS ====================
function getEffectiveHeading() {
  if (state.manualHeading !== "auto") {
    return Number(state.manualHeading) || 0;
  }
  return ((state.heading % 360) + 360) % 360;
}

function sharesHighwayRef(refA, refB) {
  if (!refA || !refB) return false;
  const listA = refA
    .toUpperCase()
    .split(/[;/]/)
    .map((s) => s.trim());
  const listB = refB
    .toUpperCase()
    .split(/[;/]/)
    .map((s) => s.trim());
  return listA.some((a) => listB.includes(a));
}

function cleanExitRef(rawRef) {
  if (!rawRef) return "";
  return rawRef
    .replace(/^exit\s+/i, "")
    .split(";")[0]
    .trim();
}

function normalizeHighwayRef(rawRef) {
  if (!rawRef) return "";
  return rawRef.split(";")[0].trim().replace(/\s+/g, " ");
}

function classifyHighwayType(ref) {
  if (/^I[\s-]/i.test(ref)) return "interstate";
  if (/^US[\s-]/i.test(ref)) return "us";
  if (ref && ref !== "HWY") return "state";
  return "interstate";
}

function formatHighwayFullName(ref) {
  if (/^I\s*(\d+)/i.test(ref)) {
    return ref.replace(/^I\s*/i, "Interstate ");
  }
  if (/^US\s*(\d+)/i.test(ref)) {
    return ref.replace(/^US\s*/i, "US Route ");
  }
  return `Highway ${ref}`;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeBearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function moveAlongBearing(lat, lon, bearingDeg, distanceMeters) {
  const R = 6371000;
  const brng = (bearingDeg * Math.PI) / 180;
  const dByR = distanceMeters / R;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dByR) + Math.cos(lat1) * Math.sin(dByR) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dByR) * Math.cos(lat1),
      Math.cos(dByR) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (lon2 * 180) / Math.PI
  };
}

function angularDifference(deg1, deg2) {
  const diff = Math.abs(((deg1 - deg2) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function degreesToCardinal(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

function formatDistance(meters) {
  if (state.useMetric) {
    const km = meters / 1000;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  }
  const miles = meters / 1609.344;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

function formatShortRampDistance(meters) {
  if (state.useMetric) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)}mi`;
}

function formatEta(meters, speedMph) {
  const effectiveMph = speedMph >= 15 ? speedMph : 65;
  const miles = meters / 1609.344;
  const minutes = Math.max(1, Math.round((miles / effectiveMph) * 60));
  return `~${minutes} min`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Launch app on DOM ready
document.addEventListener("DOMContentLoaded", initApp);
