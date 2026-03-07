// ==================== DATA STORE ====================
let movements = [];
let overnightParking = [];
let specialInstructions = [];
let scheduleInfo = {};

// ==================== LOAD DATA FROM JSON ====================
fetch('data.json')
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load data.json');
        }
        return response.json();
    })
    .then(data => {
        movements = data.movements;
        overnightParking = data.overnightParking;
        specialInstructions = data.specialInstructions;
        scheduleInfo = data.schedule;

        updateHeader();
        render();

        // Auto-refresh every 30 seconds
        setInterval(render, 30000);
    })
    .catch(error => {
        console.error('Error loading data:', error);
        document.getElementById('currentTimeDisplay').innerHTML =
            '❌ Error loading schedule data. Make sure data.json exists.';
        document.getElementById('tableBody').innerHTML =
            '<tr><td colspan="8" style="color: red; text-align: center;">Failed to load data.json. Check console (F12) for details.</td></tr>';
    });

// ==================== HEADER ====================
function updateHeader() {
    document.getElementById('headerBadges').innerHTML = `
        <span class="badge">${scheduleInfo.date || 'Unknown'}</span>
        <span class="badge orange">${scheduleInfo.day || 'Unknown'}</span>
        <span class="live-indicator">
            <span class="live-dot"></span> LIVE
        </span>
    `;

    document.getElementById('footer').innerHTML =
        `Maafaru International Airport (VRDA) · ${scheduleInfo.footerDate || 'Schedule'} · Auto-refreshes every 30 seconds`;
}

// ==================== TIME UTILITIES ====================
function getCurrentMaldivesTime() {
    const now = new Date();

    let mldHours = now.getUTCHours() + 5;
    let mldMinutes = now.getUTCMinutes();

    if (mldHours >= 24) mldHours -= 24;

    const totalMinutes = mldHours * 60 + mldMinutes;
    const formatted = `${mldHours.toString().padStart(2, '0')}:${mldMinutes.toString().padStart(2, '0')}`;

    return { hours: mldHours, minutes: mldMinutes, totalMinutes, formatted };
}

function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// ==================== SORTING ====================
function getEarliestTime(movement) {
    const times = [];

    if (movement.crt && movement.crt !== "") {
        const crtMatch = movement.crt.match(/(\d{2}:\d{2})/);
        if (crtMatch) times.push(timeToMinutes(crtMatch[1]));
    }

    if (movement.arr && movement.arr !== "") times.push(timeToMinutes(movement.arr));
    if (movement.dep && movement.dep !== "") times.push(timeToMinutes(movement.dep));

    return times.length > 0 ? Math.min(...times) : 9999;
}

// ==================== STATUS ====================
function getStatus(arr, dep, crt) {
    const now = getCurrentMaldivesTime().totalMinutes;

    const arrMins = arr && arr !== "" ? timeToMinutes(arr) : null;
    const depMins = dep && dep !== "" ? timeToMinutes(dep) : null;

    // Extract CRT minutes (handles "08:30 LT" format)
    let crtMins = null;
    if (crt && crt !== "") {
        const crtMatch = crt.match(/(\d{2}:\d{2})/);
        if (crtMatch) crtMins = timeToMinutes(crtMatch[1]);
    }

    const isTransit = arrMins !== null && depMins !== null;
    const isArrOnly = arrMins !== null && depMins === null;
    const isDepOnly = arrMins === null && depMins !== null;

    // ── TRANSIT (has both ARR and DEP) ──
    if (isTransit) {
        if (now >= depMins)                          return { text: "DEPARTED", class: "status-departed" };
        if (crtMins !== null && now >= crtMins)      return { text: "ONGOING",  class: "status-ongoing"  };
        if (now >= arrMins)                          return { text: "LANDED",   class: "status-landed"   };
        // SOON: 30 min before CRT (if exists) or ARR
        const soonTarget = crtMins !== null ? crtMins : arrMins;
        if (now >= soonTarget - 30)                  return { text: "SOON",     class: "status-soon"     };
        return { text: "", class: "" };
    }

    // ── ARRIVAL ONLY ──
    if (isArrOnly) {
        if (now >= arrMins + 180)                    return { text: "FINISHED", class: "status-departed" };
        if (now >= arrMins)                          return { text: "LANDED",   class: "status-landed"   };
        const soonTarget = crtMins !== null ? crtMins : arrMins;
        if (now >= soonTarget - 30)                  return { text: "SOON",     class: "status-soon"     };
        return { text: "", class: "" };
    }

    // ── DEPARTURE ONLY ──
    if (isDepOnly) {
        if (now >= depMins)                          return { text: "DEPARTED", class: "status-departed" };
        if (crtMins !== null && now >= crtMins)      return { text: "ONGOING",  class: "status-ongoing"  };
        const soonTarget = crtMins !== null ? crtMins : depMins;
        if (now >= soonTarget - 30)                  return { text: "SOON",     class: "status-soon"     };
        return { text: "", class: "" };
    }

    // ── CRT ONLY (no arr/dep) ──
    if (crtMins !== null) {
        if (now >= crtMins)                          return { text: "ONGOING",  class: "status-ongoing"  };
        if (now >= crtMins - 30)                     return { text: "SOON",     class: "status-soon"     };
        return { text: "", class: "" };
    }

    return { text: "", class: "" };
}

// ==================== RENDER ====================
function render() {
    const currentTime = getCurrentMaldivesTime();
    document.getElementById('currentTimeDisplay').innerHTML =
        `🕐 Maldives Time: <strong>${currentTime.formatted}</strong>`;

    const tableBody = document.getElementById('tableBody');
    const movementList = document.getElementById('movementList');

    let arrivals = 0, departures = 0;

    const sorted = [...movements].sort((a, b) => getEarliestTime(a) - getEarliestTime(b));

    console.log('=== SORTED MOVEMENTS ===');
    sorted.forEach((m, index) => {
        const earliest = getEarliestTime(m);
        const hours = Math.floor(earliest / 60);
        const mins = earliest % 60;
        console.log(`${index + 1}. ${m.reg}: ${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} | CRT:${m.crt || '—'} ARR:${m.arr || '—'} DEP:${m.dep || '—'}`);
    });

    let tableRows = '';
    let cardsHtml = '';

    sorted.forEach(m => {
        if (m.arr && m.arr !== "" && (!m.dep || m.dep === "")) arrivals++;
        else if (m.dep && m.dep !== "" && (!m.arr || m.arr === "")) departures++;
        else if (m.arr && m.arr !== "" && m.dep && m.dep !== "") { arrivals++; departures++; }

        const status = getStatus(m.arr, m.dep, m.crt);

        let displayTime = '—';
        if (m.arr && m.arr !== "") displayTime = m.arr;
        else if (m.dep && m.dep !== "") displayTime = m.dep;
        else if (m.crt && m.crt !== "") displayTime = m.crt.replace(' LT', '');

        const routeDisplay = m.reg === "OK-SIX" ? "Crew Aircraft Visit" : m.route;

        tableRows += `
            <tr>
                <td class="reg">${m.reg}</td>
                <td>${m.operator}</td>
                <td>${m.arr || '—'}</td>
                <td>${m.dep || '—'}</td>
                <td>${routeDisplay}</td>
                <td>${m.pax}</td>
                <td>${m.crt || '—'}</td>
                <td><span class="status-badge ${status.class}">${status.text}</span></td>
            </tr>
        `;

        cardsHtml += `
            <div class="movement-card">
                <div class="card-header">
                    <span class="reg-mobile">${m.reg}</span>
                    <span class="time-mobile">${displayTime}</span>
                </div>
                <div class="details-grid">
                    <div class="detail-item">
                        <span class="detail-label">Operator</span>
                        <span class="detail-value">${m.operator}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">PAX</span>
                        <span class="detail-value pax-chip">${m.pax}</span>
                    </div>
                    ${m.crt && m.crt !== "" ? `
                    <div class="detail-item">
                        <span class="detail-label">CRT</span>
                        <span class="detail-value crt-chip">${m.crt}</span>
                    </div>
                    ` : ''}
                    <div class="detail-item">
                        <span class="detail-label">Status</span>
                        <span class="detail-value status-badge ${status.class}">${status.text}</span>
                    </div>
                </div>
                <div class="route-mobile">${routeDisplay}</div>
            </div>
        `;
    });

    tableBody.innerHTML = tableRows;
    movementList.innerHTML = cardsHtml;

    document.getElementById('summaryStats').innerHTML = `
        <div class="stat-bubble"><span class="stat-number">${arrivals}</span> arrivals</div>
        <div class="stat-bubble"><span class="stat-number">${departures}</span> departures</div>
    `;

    document.getElementById('parkingTags').innerHTML =
        overnightParking.map(t => `<span class="parking-tag">${t}</span>`).join('');

    document.getElementById('specialItems').innerHTML =
        specialInstructions.map(s => `<span class="special-item">${s}</span>`).join('');
}
