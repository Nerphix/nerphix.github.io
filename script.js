// ==================== DATA STORE ====================
let dayIndex = [];       // list of days from index.json
let activeDayIndex = 0;
let dayCache = {};       // cache loaded day files so we don't re-fetch

// ==================== BOOT ====================
fetch('index.json')
    .then(r => { if (!r.ok) throw new Error('Failed to load index.json'); return r.json(); })
    .then(data => {
        dayIndex = data.days;

        // Auto-select today's date if it exists, else first day
        const todayIso = getTodayMaldivesIso();
        const todayIdx = dayIndex.findIndex(d => d.isoDate === todayIso);
        activeDayIndex = todayIdx >= 0 ? todayIdx : 0;

        buildTabs();
        loadAndRender(activeDayIndex);

        // Auto-refresh every 30 seconds (only re-renders current day)
        setInterval(() => loadAndRender(activeDayIndex), 30000);
    })
    .catch(err => {
        console.error(err);
        document.getElementById('currentTimeDisplay').innerHTML = '❌ Error loading index.json';
    });

// ==================== LOAD DAY ====================
function loadAndRender(index) {
    const isoDate = dayIndex[index].isoDate;

    // Use cache if already loaded
    if (dayCache[isoDate]) {
        renderDay(dayCache[isoDate]);
        return;
    }

    fetch(`${isoDate}.json?v=${Date.now()}`)
        .then(r => { if (!r.ok) throw new Error(`Failed to load ${isoDate}.json`); return r.json(); })
        .then(data => {
            dayCache[isoDate] = data;
            renderDay(data);
        })
        .catch(err => {
            console.error(err);
            document.getElementById('tableBody').innerHTML =
                `<tr><td colspan="8" style="color:red;text-align:center;padding:30px;">Failed to load ${isoDate}.json</td></tr>`;
            document.getElementById('movementList').innerHTML =
                `<div style="color:red;text-align:center;padding:20px;">Failed to load ${isoDate}.json</div>`;
        });
}

// ==================== TABS ====================
function buildTabs() {
    const container = document.getElementById('dateTabs');
    container.innerHTML = dayIndex.map((day, i) => `
        <button class="date-tab ${i === activeDayIndex ? 'active' : ''}" onclick="switchDay(${i})">
            ${day.date}
        </button>
    `).join('');
}

function switchDay(index) {
    activeDayIndex = index;
    buildTabs();
    loadAndRender(index);
    const tabs = document.querySelectorAll('.date-tab');
    if (tabs[index]) tabs[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

// ==================== HEADER ====================
function updateHeader(scheduleInfo) {
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
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const maldivesDate = new Date(utcMs + (5 * 3600000));
    const mldHours = maldivesDate.getHours();
    const mldMinutes = maldivesDate.getMinutes();
    const totalMinutes = mldHours * 60 + mldMinutes;
    const formatted = `${mldHours.toString().padStart(2,'0')}:${mldMinutes.toString().padStart(2,'0')}`;
    return { hours: mldHours, minutes: mldMinutes, totalMinutes, formatted };
}

function getTodayMaldivesIso() {
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const d = new Date(utcMs + (5 * 3600000));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

// ==================== SORTING ====================
function getEarliestTime(movement) {
    const times = [];
    if (movement.crt && movement.crt !== "") {
        const match = movement.crt.match(/(\d{2}:\d{2})/);
        if (match) times.push(timeToMinutes(match[1]));
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
    let crtMins = null;
    if (crt && crt !== "") {
        const match = crt.match(/(\d{2}:\d{2})/);
        if (match) crtMins = timeToMinutes(match[1]);
    }

    const isTransit = arrMins !== null && depMins !== null;
    const isArrOnly = arrMins !== null && depMins === null;
    const isDepOnly = arrMins === null && depMins !== null;

    if (isTransit) {
        if (now >= depMins)                         return { text: "DEPARTED", class: "status-departed" };
        if (crtMins !== null && now >= crtMins)     return { text: "ONGOING",  class: "status-ongoing"  };
        if (now >= arrMins)                         return { text: "LANDED",   class: "status-landed"   };
        const soonTarget = crtMins !== null ? crtMins : arrMins;
        if (now >= soonTarget - 30)                 return { text: "SOON",     class: "status-soon"     };
        return { text: "", class: "" };
    }
    if (isArrOnly) {
        if (now >= arrMins + 180)                   return { text: "FINISHED", class: "status-departed" };
        if (now >= arrMins)                         return { text: "LANDED",   class: "status-landed"   };
        const soonTarget = crtMins !== null ? crtMins : arrMins;
        if (now >= soonTarget - 30)                 return { text: "SOON",     class: "status-soon"     };
        return { text: "", class: "" };
    }
    if (isDepOnly) {
        if (now >= depMins)                         return { text: "DEPARTED", class: "status-departed" };
        if (crtMins !== null && now >= crtMins)     return { text: "ONGOING",  class: "status-ongoing"  };
        const soonTarget = crtMins !== null ? crtMins : depMins;
        if (now >= soonTarget - 30)                 return { text: "SOON",     class: "status-soon"     };
        return { text: "", class: "" };
    }
    if (crtMins !== null) {
        if (now >= crtMins + 120)                   return { text: "FINISHED", class: "status-departed" };
        if (now >= crtMins)                         return { text: "ONGOING",  class: "status-ongoing"  };
        if (now >= crtMins - 30)                    return { text: "SOON",     class: "status-soon"     };
        return { text: "", class: "" };
    }
    return { text: "", class: "" };
}

// ==================== RENDER ====================
function renderDay(data) {
    const currentTime = getCurrentMaldivesTime();
    document.getElementById('currentTimeDisplay').innerHTML =
        `🕐 Maldives Time: <strong>${currentTime.formatted}</strong>`;

    updateHeader(data.schedule);

    const movements = data.movements;
    const overnightParking = data.overnightParking;
    const specialInstructions = data.specialInstructions;

    const tableBody = document.getElementById('tableBody');
    const movementList = document.getElementById('movementList');

    let arrivals = 0, departures = 0;
    const sorted = [...movements].sort((a, b) => getEarliestTime(a) - getEarliestTime(b));

    let tableRows = '';
    let cardsHtml = '';

    if (sorted.length === 0) {
        tableRows = '<tr><td colspan="8" style="text-align:center;color:#54778b;padding:30px;">No movements scheduled for this day.</td></tr>';
        cardsHtml = '<div style="text-align:center;color:#54778b;padding:20px;background:white;border-radius:12px;">No movements scheduled for this day.</div>';
    }

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
                    </div>` : ''}
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
        overnightParking.map(t => `<span class="parking-tag">${t}</span>`).join('') ||
        '<span style="color:#54778b;font-size:0.85rem;">None</span>';

    document.getElementById('specialItems').innerHTML =
        specialInstructions.map(s => `<span class="special-item">${s}</span>`).join('') ||
        '<span style="color:#54778b;font-size:0.85rem;">None</span>';
}
