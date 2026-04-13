
function getVesselType(type) {
  if (type === "Pleasure") {
    return 'sailing'
  }

  if (['tug', 'cargo', 'tanker', 'passenger', 'military', 'fishing', 'sailing', 'not-available'].includes(type.toLowerCase())) {
    return type.toLowerCase()
  }

  type = Number(type)

  if ([21, 22, 31, 32, 52, 1023, 1025].includes(type)) {
    return 'tug'
  } else if ((type >= 70 && type <= 79) || type === 1003 || type === 1004 || type === 1016) {
    return 'cargo'
  } else if ((type >= 80 && type <= 89) || type === 1017 || type === 1024) {
    return 'tanker'
  } else if ((type >= 60 && type <= 69) || (type >= 1012 && type <= 1015)) {
    return 'passenger'
  } else if (type === 35 || type === 1021) {
    return 'military'
  } else if (type === 30 || type === 1001 || type === 1002) {
    return 'fishing'
  } else if (type === 36 || type === 37 || type === 1019) {
    return 'sailing'
  } else if (type === 0) {
    return 'not-available'
  }

  return 'other'
}


function typeToRu(type) {
  const trans = {
    'tug': 'Буксир',
    'cargo': 'Грузовой',
    'tanker': 'Танкер',
    'passenger': 'Пассажирский',
    'military': 'Военный',
    'fishing': 'Рыболовный',
    'sailing': 'Парусник',
    'not-available': 'Не известно',
    'other': 'Другое',
  }
  return trans[type]
}


async function drawVessels() {
  await ymaps3.ready;

  const {
    YMapMarker,
  } = ymaps3;

  ymaps3.import.registerCdn('https://cdn.jsdelivr.net/npm/{package}', [
    '@yandex/ymaps3-clusterer@0.0.10'
  ]);
  const { YMapClusterer, clusterByGrid } = await ymaps3.import('@yandex/ymaps3-clusterer@0.0.1');

  // $(".vessel-marker").remove();
  // $(".vessel-cluster").remove();
  if (clusterer) {
    map.removeChild(clusterer);
  }


  const createMarkerElement = (feature) => {
    const markerElement = document.createElement("div");
    //console.log(`http://localhost:5000/static/img/map/vessels/${getVesselType(feature.type)}.svg`);
    
    markerElement.className = "vessel-marker";
    markerElement.innerHTML = `
        <div onclick="openVesselWindow('${feature.id}')">
            <img src="/static/img/map/vessels/${getVesselType(feature.type)}.svg" style="transform: rotate(${feature.course}deg);" class="vessel-type-${feature.type}">
        </div>
      `;
    return markerElement;
  }
  const marker = (feature) => {
    return new YMapMarker(
      {
        coordinates: feature.geometry.coordinates,
        source: 'vessels'
      },
      createMarkerElement(feature)
    );
  }

  const createClusterElement = (vesselsCount) => {
    const markerElement = document.createElement("div");
    markerElement.className = "vessel-cluster";
    if (vesselsCount > 999) {
      markerElement.className += " vessel-cluster--extrabig";
    } else if (vesselsCount > 99) {
      markerElement.className += " vessel-cluster--big";
    } else if (vesselsCount > 9) {
      markerElement.className += " vessel-cluster--medium";
    } else {
      markerElement.className += " vessel-cluster--small";
    }
    markerElement.innerHTML = `${vesselsCount}`;
    return markerElement;
  }
  const cluster = (coordinates, features) => {
    return new YMapMarker(
      {
        coordinates,
        source: 'vessels',
        onClick() {
          const allCoordinates = features.map((feature) => feature.geometry.coordinates);
          let minLat = Infinity, minLng = Infinity;
          let maxLat = -Infinity, maxLng = -Infinity;
          for (const coords of allCoordinates) {
            const lat = coords[1];
            const lng = coords[0];

            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          }
          // Попытка сделать небольние поправки в зависимости от масштаба
          const avg = (maxLat - minLat + maxLng - minLng) / 2;
          const k = 0.1;
          minLat -= avg * k;
          maxLat += avg * k;
          minLng -= avg * k;
          maxLng += avg * k;
          map.update({
            location: {
              bounds: [[minLng, minLat], [maxLng, maxLat]],
              easing: 'ease-in-out',
              duration: 1500
            }
          });
        }
      },
      createClusterElement(features.length)
    );
  }

  const points = vessels.map(vessel => ({
    type: 'Feature',
    id: vessel.mmsi,
    geometry: {
      type: 'Point',
      coordinates: [vessel.lon, vessel.lat]
    },
    course: vessel.course,
    type: vessel.type
  }));


  clusterer = new YMapClusterer({
    method: clusterByGrid({ gridSize: 64 }),
    features: points,
    marker,
    cluster
  });

  map.addChild(clusterer);

  $(".map-loader-container").hide()
}


async function initMap() {
  await ymaps3.ready;

  const {
    YMap,
    YMapDefaultSchemeLayer,
    YMapLayer,
    YMapFeatureDataSource,
    YMapControls
  } = ymaps3;

  const { YMapGeolocationControl, YMapZoomControl } = await ymaps3.import(
    "@yandex/ymaps3-controls@0.0.1"
  );

  let mapCenter = [49.1221, 55.7887]
  let zoom = 3;

  map = new YMap(document.getElementById("map"), {
    location: {
      center: mapCenter,
      zoom: zoom,
    },
    controls: ["routeButtonControl"],
  });

  map.addChild(new YMapDefaultSchemeLayer());
  map.addChild(new YMapFeatureDataSource({ id: 'vessels' }));
  map.addChild(new YMapLayer({ source: 'vessels', type: 'markers', zIndex: 1800 }));
  map.addChild(new YMapFeatureDataSource({ id: 'tracker-line' }));
  map.addChild(new YMapLayer({ source: 'tracker-line', type: 'lines', zIndex: 1801 }));
  map.addChild(new YMapFeatureDataSource({ id: 'tracker-markers' }));
  map.addChild(new YMapLayer({ source: 'tracker-markers', type: 'markers', zIndex: 1802 }));

  map.addChild(
    // Using YMapControls you can change the position of the control
    new YMapControls({ position: "right" }) // bottom left
      // Add the geolocation control to the map
      // .addChild(new YMapGeolocationControl({ source: 'vessels' }))
      .addChild(new YMapZoomControl({ easing: 'ease-in-out' }))
  );

  document.getElementsByClassName("ymaps3x0--control-button")[0].click();

  await drawVessels()
}


function loadVessels(datetime) {
  return $.ajax({
    type: "GET",
    url: `/api/get-all-vessels?datetime=${datetime}`,
    success: function (data) {
      return data;
    },
  });
}


function loadVesselsAndDraw() {
  $(".map-loader-container").show()
  loadVessels(datetime).then(async (data) => {
    const selectedTypes = [];
    if ($('#checkboxTug').is(':checked')) selectedTypes.push('tug');
    if ($('#checkboxFishing').is(':checked')) selectedTypes.push('fishing');
    if ($('#checkboxMilitary').is(':checked')) selectedTypes.push('military');
    if ($('#checkboxTanker').is(':checked')) selectedTypes.push('tanker');
    if ($('#checkboxCargo').is(':checked')) selectedTypes.push('cargo');
    if ($('#checkboxOther').is(':checked')) selectedTypes.push('other');
    if ($('#checkboxSailing').is(':checked')) selectedTypes.push('sailing');
    if ($('#checkboxNotAvailable').is(':checked')) selectedTypes.push('not-available');
    if ($('#checkboxPassenger').is(':checked')) selectedTypes.push('passenger');

    vessels = data.vessels.filter(vessel => selectedTypes.includes(getVesselType(vessel.type)));
    vessels = vessels.filter((el) => {return el.lon !== 0})

    await drawVessels()
  })
}



function renderTypeModel(type) {
  // Получаем контейнер для модели
  const container = document.getElementById('type-model');
  container.innerHTML = ''
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Инициализация сцены, камеры и рендерера
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });

  renderer.setSize(width, height);
  renderer.setClearColor(0xf0f0f0);
  container.appendChild(renderer.domElement);

  // Параметры масштабирования
  const scaleSettings = {
    initialScale: 6.0,    // Начальный масштаб модели (увеличено в 2 раза)
    autoScale: true,      // Автоматическое масштабирование под размер контейнера
    manualScale: 1.5      // Дополнительный ручной множитель масштаба
  };

  // Позиционирование камеры
  camera.position.set(5, 3, 5); // x, y, z - камера теперь выше и сбоку
  camera.lookAt(0, 0, 0); // Камера смотрит в центр сцены

  // Освещение
  const ambientLight = new THREE.AmbientLight(0xffffff, 3);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // Загрузка модели
  const loader = new THREE.GLTFLoader();
  let model;

  loader.load(
    `/static/3d-models/${type}.glb`,
    function (gltf) {
      model = gltf.scene;
      scene.add(model);
      
      // Применяем начальное масштабирование
      model.scale.set(scaleSettings.initialScale, scaleSettings.initialScale, scaleSettings.initialScale);
      
      // Центрирование модели
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.y -= center.y;
      model.position.z -= center.z;
      
      // Автоматическое масштабирование и позиционирование камеры
      if (scaleSettings.autoScale) {
          const size = box.getSize(new THREE.Vector3()).length();
          const maxDim = Math.max(size, 2);
          
          // Новая позиция камеры с учетом масштаба
          const cameraDistance = maxDim * 2.5 * scaleSettings.manualScale;
          camera.position.set(cameraDistance, cameraDistance * 0.6, cameraDistance);
          camera.lookAt(0, 0, 0);
          
          // Дополнительное масштабирование
          const scaleMultiplier = Math.min(
              width / (size * scaleSettings.initialScale),
              height / (size * scaleSettings.initialScale)
          ) * 0.8;
          
          model.scale.multiplyScalar(scaleMultiplier * scaleSettings.manualScale);
      }
    },
    undefined,
    function (error) {
        console.error('Error loading model:', error);
    }
  );

  // Обработка изменения размера окна
  window.addEventListener('resize', () => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
  });

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Анимация вращения
  function animate() {
      requestAnimationFrame(animate);
      
      if (model) {
          model.rotation.y += 0.006; // Скорость вращения
      }
      
      renderer.render(scene, camera);
      controls.update();
  }

  animate();
}


function loadVesselInfo(mmsi) {
  $(".vessel-info-sidebar-loader").show()
  $(".real-content").hide()

  $.ajax({
    url: `/api/get-vessel-info?mmsi=${mmsi}`,
    method: 'GET',
    success: function (data) {
      console.log(data);
      const vessel = data.vessel
      // Устанавливаем данные
      let hasImage = vessel.image && 
                      vessel.image !== '0' && 
                      vessel.image !== 'https://gloap.net/wp-content/themes/pdxtemplate/img/default/ship.png' &&
                      vessel.image !== 'https://static.vesselfinder.net/images/cool-ship2@2.png'
      
      if (hasImage) {
        $(".image-container").show()
        $("#vessel-img").attr("src", vessel.image)
        $("#type-model").hide()
      } else {
        $(".image-container").hide()
        $("#type-model").show()
      }

      $("#vessel-name").text(vessel.name)
      $("#vessel-mmsi").text(vessel.mmsi)
      $("#vessel-imo").text(vessel.imo)
      
      try {
        country_code = mmsi_counries[vessel.mmsi.toString().slice(0, 3)][0].toLowerCase()
        country_name = ""
        country_codes.forEach(element => {
          if (element.iso_code2.toLowerCase() === country_code) {
            country_name = element.name_ru
          }
        });

        $("#vessel-country").html(`
          <div class="country-flag-container">
              <img src="https://static.vesselfinder.net/images/flags/4x3/${country_code}.svg">
            </div>
            ${country_name}
        `)
      } catch {
        $("#vessel-country").html(`
            Не опознано
        `)
      }

      $("#vessel-length").text(`${vessel.length} м`)
      $("#vessel-width").text(`${vessel.width} м`)
      $("#vessel-draft").text(`${vessel.draft} м`)
      $("#vessel-type").text(typeToRu(getVesselType(vessel.type)))

      $(".vessel-info-sidebar-loader").hide()
      $(".real-content").show()

      document.getElementById('vessel-tracker-button').onclick = function () {
        // startTracking(vessel.mmsi)
        vessel_mmsi_tracking = mmsi
        if (!is_tracker_control_opened) toggleTrackerControl()
      }

      document.getElementById('vessel-favorite-btn').onclick = function () {
        vesselCardFavoriteBtnPressed(mmsi)
      }
      if (isVesselInFavorites(mmsi)) {
        $("#vessel-favorite-btn").html(`<i class="bi bi-star-fill"></i>`)
      } else {
        $("#vessel-favorite-btn").html(`<i class="bi bi-star"></i>`)
      }

      renderTypeModel(getVesselType(vessel.type))
    }
  })
}


function openVesselWindow(mmsi) {
  loadVesselInfo(mmsi)
  $(".vessel-info-sidebar-greeting-text").hide()
  $(".vessel-info-sidebar").addClass('show')
  $(".vessel-info-sidebar-toggle").html(`<i class="bi bi-chevron-compact-left"></i>`)
  isInfoSidebarOpened = true
}

function toggleVesselWindow(mmsi=-1) {
  if (isInfoSidebarOpened) {
    // Закрыть
    $(".vessel-info-sidebar").removeClass('show')
    $(".vessel-info-sidebar-toggle").html(`<i class="bi bi-chevron-compact-right"></i>`)
  } else {
    // Открыть
    if (mmsi !== -1) {
      loadVesselInfo(mmsi)
    }
    $(".vessel-info-sidebar").addClass('show')
    $(".vessel-info-sidebar-toggle").html(`<i class="bi bi-chevron-compact-left"></i>`)
  }
  isInfoSidebarOpened = !isInfoSidebarOpened
}


let map = null;
let isInfoSidebarOpened = false;
let currentVesselInfoMMSI = -1;
let clusterer = null;

let mmsi_counries = {}
let country_codes = {}

fetch('/static/mmsi_counries.json')
  .then(response => response.json())
  .then(jsonData => mmsi_counries = jsonData);

fetch('/static/country_codes.json')
  .then(response => response.json())
  .then(jsonData => country_codes = jsonData);


function setDateTimeToInputs(isoString) {
  if (!isoString) return;
  
  try {
      const date = new Date(isoString);
      
      if (isNaN(date.getTime())) {
          console.error('Некорректная дата');
          return;
      }
      
      const dateStr = date.toISOString().split('T')[0];
      document.getElementById('date-input').value = dateStr;
      
      const hours = date.getHours();
      document.getElementById('time-slider').value = hours;
      document.getElementById('time-value').textContent = `${hours}:00`;
  } catch (e) {
      console.error('Ошибка при разборе даты:', e);
  }
}

function getDateTimeFromInputs() {
  const dateInput = document.getElementById('date-input').value;
  const hours = document.getElementById('time-slider').value;
  if (!dateInput) return null;
  return `${dateInput}T${hours.padStart(2, '0')}:00:00`;
}

const timeSlider = document.getElementById('time-slider');
const timeValue = document.getElementById('time-value');

timeSlider.addEventListener('input', function() {
    const hour = this.value;
    timeValue.textContent = `${hour}:00`;
});

function updateDateTimeFilter() {
  $(".map-loader-container").show()

  const date = getDateTimeFromInputs()
  datetime = date
  localStorage.setItem("datetime", datetime)
  loadVesselsAndDraw()
}


let datetime = localStorage.getItem("datetime")
if (!datetime) {
  datetime = "2024-07-07T00:00:00"
}
setDateTimeToInputs(datetime)


document.getElementById('date-input').addEventListener('change', updateDateTimeFilter);
document.getElementById('time-slider').addEventListener('change', updateDateTimeFilter);




loadVessels(datetime).then((data) => {
  vessels = data.vessels;
  vessels = vessels.filter((el) => {return el.lon !== 0})
  // vessels = vessels.filter((el) => {return getVesselType(el.type) === 'military'})
  // vessels = vessels.filter((el) => {return el.mmsi === 367670110})
  initMap();
});


let is_datatime_control_opened = false

function toggleDateTimeControl() {
  if (is_datatime_control_opened) {
    $(".date-time-picker").removeClass("show")
    $("#toggle-datetime-control-btn").removeClass("active");
  } else {
    $(".date-time-picker").addClass("show")
    $("#toggle-datetime-control-btn").addClass("active");
  }
  is_datatime_control_opened = !is_datatime_control_opened
}


let is_type_sort_control_opened = false

function toggleTypeSortControl() {
  if (is_type_sort_control_opened) {
    $(".type-sort-control").removeClass("show")
    $("#toggle-type-sort-control-btn").removeClass("active");
  } else {
    $(".type-sort-control").addClass("show")
    $("#toggle-type-sort-control-btn").addClass("active");
  }
  is_type_sort_control_opened = !is_type_sort_control_opened
}



function filterByType() {
  loadVesselsAndDraw()
}

// $('#checkboxTug').prop('checked', true);
// $('#checkboxFishing').prop('checked', true);
// $('#checkboxMilitary').prop('checked', true);
// $('#checkboxTanker').prop('checked', true);
// $('#checkboxCargo').prop('checked', true);
// $('#checkboxOther').prop('checked', true);
// $('#checkboxSailing').prop('checked', true);
// $('#checkboxNotAvailable').prop('checked', true);
// $('#checkboxPassenger').prop('checked', true);

$('#checkboxTug').change(filterByType)
$('#checkboxFishing').change(filterByType)
$('#checkboxMilitary').change(filterByType)
$('#checkboxTanker').change(filterByType)
$('#checkboxCargo').change(filterByType)
$('#checkboxOther').change(filterByType)
$('#checkboxSailing').change(filterByType)
$('#checkboxNotAvailable').change(filterByType)
$('#checkboxPassenger').change(filterByType)


/* Search */

function search() {
  query = $(".search").val()

  if (query.length < 3) {
    return document.getElementById("search-results").innerHTML = ''
  }

  $.ajax({
    url: `/api/search-vessels?query=${query}`,
    method: 'GET',
    success: function (data) {
      console.log(data);
      const container = document.getElementById("search-results")
      container.innerHTML = ''

      data.results.forEach(vessel => {
        let img = null
        if (vessel.image && vessel.image !== '0' && vessel.image !== 'https://gloap.net/wp-content/themes/pdxtemplate/img/default/ship.png') {
          img = vessel.image
        } else {
          img = "https://static.vesselfinder.net/images/cool-ship2@2.png"
        }

        let onMapCoords = null
        for (let i = 0; i < vessels.length; i++) {
          if (vessels[i].mmsi === vessel.mmsi) {
            onMapCoords = vessels[i]
            break
          }
        }

        let mmsi = ''
        let lat = ''
        let lon = ''
        if (onMapCoords) {
          mmsi = onMapCoords.mmsi
          lat = onMapCoords.lat
          lon = onMapCoords.lon
        }
        
        container.innerHTML += `
          <div class="search-item">
            <div class="search-image-container">
              <img src="${img}">
            </div>
            <div class="search-vessel-info">
              <span class="name">${vessel.name}</span>
              <span>MMSI: ${vessel.mmsi}</span>
              <span>IMO: ${vessel.imo}</span>
              <div class="search-actions">
                <button ${onMapCoords ? '' : 'disabled'} onclick="hideSearch();showVesselWithCoords('${mmsi}', '${lat}', '${lon}')"><i class="bi bi-crosshair"></i></button>
                <button class="search-vessel-favorite" onclick="searchVesselFavoriteBtnPressed(${vessel.mmsi})">${isVesselInFavorites(vessel.mmsi) ? '<i class="bi bi-star-fill"></i>' : '<i class="bi bi-star"></i>'}</button>
                <button onclick="vessel_mmsi_tracking = ${vessel.mmsi}; hideSearch(); openVesselWindow('${vessel.mmsi}'); if(!is_tracker_control_opened) toggleTrackerControl()"><i class="bi bi-geo"></i></button>
              </div>
            </div>
          </div>
        `
      })
    }
  })
}

$(".search").on('input', search)

$('.search-background').on('click', function(e) {
  if (e.target !== this)
    return;
  hideSearch()
})

function showSearch() {
  $(".search-background").addClass("show")
}
function hideSearch() {
  $(".search-background").removeClass("show")
}


// function moveToCoords(coords) {
//   coords.latitude = coords.latitude - 0.002
//   coords.longitude = coords.longitude + 0.004
//   moveToCoordsDirectly(coords)
// }
function moveToCoordsDirectly(lat, lon) {
  map.update({location: {center: [lon, lat], zoom: 16, duration: 2000}});
}

function showVesselWithCoords(mmsi, lat, lon) {
  openVesselWindow(mmsi)
  moveToCoordsDirectly(lat, lon)
}



/* Tracker */
let is_tracker_control_opened = false
let vessel_mmsi_tracking = -1
let trackerLine = null
let startMarker = null
let endMarker = null

function toggleTrackerControl() {
  if (is_tracker_control_opened) {
    $(".tracker-control").removeClass("show")
    $("#toggle-type-sort-control-btn").prop("disabled", false);
    $("#toggle-datetime-control-btn").prop("disabled", false);
  } else {
    if (clusterer) {
      map.removeChild(clusterer);
    }

    $("#tracker-vessel-name").text(vessel_mmsi_tracking)

    $(".tracker-control").addClass("show")
    $("#toggle-type-sort-control-btn").prop("disabled", true);
    $("#toggle-datetime-control-btn").prop("disabled", true);
    if (is_datatime_control_opened) toggleDateTimeControl()
    if (is_type_sort_control_opened) toggleTypeSortControl()

    trackVessel()
  }
  is_tracker_control_opened = !is_tracker_control_opened
}


function formatDate(dateString) {
  const date = new Date(dateString);
  const pad = (num) => num.toString().padStart(2, '0'); // Добавляем ведущий ноль

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1); // Месяцы 0-11
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  const isoFormattedDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  return isoFormattedDate
}

function trackVessel() {
  const datetime_start = $("#tracker-start-datetime").val()
  const datetime_stop = $("#tracker-stop-datetime").val()

  if (!datetime_start || !datetime_stop) {
    return
  }

  $(".map-loader-container").show()

  $.ajax({
    type: "GET",
    url: `/api/track-vessel?mmsi=${vessel_mmsi_tracking}&start=${formatDate(datetime_start)}&stop=${formatDate(datetime_stop)}`,
    success: function (data) {
      if (data.results) {
        drawTrackingRoute(data.results)
      } else {
        drawTrackingRoute([])
      }
      $(".map-loader-container").hide()
    },
  });
}

$("#tracker-start-datetime").change(trackVessel)
$("#tracker-stop-datetime").change(trackVessel)


function drawTrackingRoute(points) {
  if (clusterer) {
    map.removeChild(clusterer);
  }
  if (trackerLine) {
    map.removeChild(trackerLine);
  }
  if (startMarker) {
    map.removeChild(startMarker);
  }
  if (endMarker) {
    map.removeChild(endMarker);
  }

  if (!points || points.length === 0) {
    return
  }

  // Удаляем старые маркеры
  // const markers = document.querySelectorAll('.tracker-marker');
  // markers.forEach(marker => marker.remove());

  points.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const coordinates = points.map((el) => [el.lon, el.lat]);

  const {YMapFeature, YMapMarker} = ymaps3;

  // Создаем линию маршрута
  trackerLine = new YMapFeature({
    geometry: { type: 'LineString', coordinates: coordinates },
    style: { stroke: [{ color: '#00254b', width: 3 }] },
    source: 'tracker-line'
  });
  map.addChild(trackerLine);

  // Создаем элемент для маркера начала
  const startMarkerElement = document.createElement('div');
  startMarkerElement.className = 'tracker-marker';
  startMarkerElement.innerHTML = `
    <div style="background: #00254b;">
      <i class="bi bi-flag-fill" style="font-size: 12px;"></i>
    </div>
  `;

  // Добавляем маркер начала
  startMarker = new YMapMarker(
    {
      coordinates: coordinates[0],
      source: 'tracker-markers'
    },
    startMarkerElement
  );
  map.addChild(startMarker);

  // Добавляем маркер конца (если есть более одной точки)
  if (coordinates.length > 1) {
    const endMarkerElement = document.createElement('div');
    endMarkerElement.className = 'tracker-marker';
    endMarkerElement.innerHTML = `
      <div style="background: #d9534f;">
        <i class="bi bi-geo-alt-fill" style="font-size: 12px;"></i>
      </div>
    `;

    endMarker = new YMapMarker(
      {
        coordinates: coordinates[coordinates.length - 1],
        source: 'tracker-markers'
      },
      endMarkerElement
    );
    map.addChild(endMarker);
  }

  // Автоматическое масштабирование под маршрут
  if (coordinates.length > 0) {
    let minLat = Infinity, minLng = Infinity;
    let maxLat = -Infinity, maxLng = -Infinity;
    
    for (const [lng, lat] of coordinates) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    
    // Добавляем небольшой отступ
    const padding = 0.1;
    minLat -= padding;
    maxLat += padding;
    minLng -= padding;
    maxLng += padding;
    
    map.update({
      location: {
        bounds: [[minLng, minLat], [maxLng, maxLat]],
        easing: 'ease-in-out',
        duration: 1500
      }
    });
  }
}


async function exitTracker() {
  toggleTrackerControl()

  if (trackerLine) {
    map.removeChild(trackerLine);
  }
  if (startMarker) {
    map.removeChild(startMarker);
  }
  if (endMarker) {
    map.removeChild(endMarker);
  }

  await drawVessels()
}



/* Favorite */
function addVesselToFavorites(mmsi) {
  mmsi = Number(mmsi)
  const favoriteVessels = JSON.parse(localStorage.getItem("favoriteVessels") || "[]");
  if (!favoriteVessels.includes(mmsi)) {
    favoriteVessels.push(mmsi);
    localStorage.setItem("favoriteVessels", JSON.stringify(favoriteVessels));
    return true;
  }
  return false;
}

function removeVesselFromFavorites(mmsi) {
  mmsi = Number(mmsi)
  const favoriteVesselsStr = localStorage.getItem("favoriteVessels");
  if (!favoriteVesselsStr) return;
  let favoriteVessels = JSON.parse(favoriteVesselsStr);
  favoriteVessels = favoriteVessels.filter(vesselMmsi => vesselMmsi !== mmsi);  
  localStorage.setItem("favoriteVessels", JSON.stringify(favoriteVessels));
}

function isVesselInFavorites(mmsi) {
  mmsi = Number(mmsi)
  const favoriteVessels = JSON.parse(localStorage.getItem("favoriteVessels") || "[]");
  return favoriteVessels.includes(mmsi);
}

function vesselCardFavoriteBtnPressed(mmsi) {
  if (isVesselInFavorites(mmsi)) {
    removeVesselFromFavorites(mmsi)
    $("#vessel-favorite-btn").html(`<i class="bi bi-star"></i>`)
  } else {
    addVesselToFavorites(mmsi)
    $("#vessel-favorite-btn").html(`<i class="bi bi-star-fill"></i>`)
  }
}

function searchVesselFavoriteBtnPressed(mmsi) {
  if (isVesselInFavorites(mmsi)) {
    removeVesselFromFavorites(mmsi)
  } else {
    addVesselToFavorites(mmsi)
  }

  const vesselCards = document.querySelectorAll('.search-item');
  vesselCards.forEach(card => {
    const mmsiElement = card.querySelector('.search-vessel-info span:nth-child(2)');
    if (mmsiElement && mmsiElement.textContent.includes(`MMSI: ${mmsi}`)) {
      const favoriteButton = card.querySelector('.search-vessel-favorite');
      if (favoriteButton) {
        favoriteButton.innerHTML = isVesselInFavorites(mmsi) ? '<i class="bi bi-star-fill"></i>' : '<i class="bi bi-star"></i>';
      }
    }
  });
}



$('.favorites-background').on('click', function(e) {
  if (e.target !== this)
    return;
  hideFavorites()
})

function showFavorites() {
  $(".favorites-background").addClass("show")
  loadFavorites(vessels)
}
function hideFavorites() {
  $(".favorites-background").removeClass("show")
}


async function loadFavorites(vessels) {
  const favorites = JSON.parse(localStorage.getItem("favoriteVessels") || "[]")
  const favoritesContainer = document.getElementById("favorites")
  favoritesContainer.innerHTML = ''

  for (let i = 0; i < favorites.length; i++) {
    const mmsi = favorites[i]
    const vessel = await new Promise((resolve, reject) => {
      $.ajax({
        type: "GET",
        url: `/api/get-vessel-info?mmsi=${mmsi}`,
        success: function (data) {
          resolve(data.vessel)
        },
      });
    })

    let onMapCoords = null
    for (let i = 0; i < vessels.length; i++) {
      if (vessels[i].mmsi === vessel.mmsi) {
        onMapCoords = vessels[i]
        break
      }
    }
    let lat = ''
    let lon = ''
    if (onMapCoords) {
      lat = onMapCoords.lat
      lon = onMapCoords.lon
    }

    favoritesContainer.innerHTML += `
      <div class="favorites-item">
        <div class="info">
          <span>${vessel.name}</span>
          <span>${vessel.mmsi}</span>
        </div>
        <div class="btns">
          <button ${onMapCoords ? '' : 'disabled'} onclick="hideFavorites();showVesselWithCoords('${mmsi}', '${lat}', '${lon}')"><i class="bi bi-crosshair"></i></button>
          <button onclick="vessel_mmsi_tracking = ${vessel.mmsi}; hideFavorites(); openVesselWindow('${vessel.mmsi}'); if(!is_tracker_control_opened) toggleTrackerControl()"><i class="bi bi-geo"></i></button>
        </div>
      </div>
    `

  }
}

