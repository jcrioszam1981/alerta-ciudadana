let modoReporte=false
let categoria=""
let subtipo=""

const map=L.map('map').setView([27.0817,-109.4447],13)

L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{
maxZoom:19
}
).addTo(map)

const markers=L.markerClusterGroup({
showCoverageOnHover:false,
spiderfyOnMaxZoom:true,
animate:true
})

map.addLayer(markers)

const iconos={

Bache:"https://cdn-icons-png.flaticon.com/512/2921/2921822.png",
Basura:"https://cdn-icons-png.flaticon.com/512/565/565491.png",
Drenaje:"https://cdn-icons-png.flaticon.com/512/3063/3063827.png",
Agua:"https://cdn-icons-png.flaticon.com/512/1684/1684375.png",
Luminaria:"https://cdn-icons-png.flaticon.com/512/2972/2972185.png"

}

function crearMarcador(r){

let tipo=r.categoria.split(" ")[0]

let icono=iconos[tipo]

let imagen=r.foto
? "/uploads/"+r.foto
: icono

let html=`
<div class="pin">
<img src="${imagen}" class="pin-img">
</div>
`

const icon=L.divIcon({
html:html,
className:"",
iconSize:[40,40],
iconAnchor:[20,40]
})

return L.marker([r.lat,r.lng],{icon:icon})

}

function popupReporte(r){

return `

<div class="popupReporte">

<h3>${r.categoria}</h3>

<p>${r.descripcion || ""}</p>

${r.foto
? `<img src="/uploads/${r.foto}" width="200">`
: "Sin foto"}

</div>

`

}

function actualizarEstadisticas(data){

let baches=0
let basura=0
let drenaje=0

data.forEach(r=>{

if(r.categoria.includes("Bache")) baches++
if(r.categoria.includes("Basura")) basura++
if(r.categoria.includes("Drenaje")) drenaje++

})

document.getElementById("baches").innerText=baches
document.getElementById("basura").innerText=basura
document.getElementById("drenaje").innerText=drenaje

}

function cargarReportes(){

markers.clearLayers()

fetch("/reportes")
.then(res=>res.json())
.then(data=>{

data.forEach(r=>{

let marker=crearMarcador(r)

marker.bindPopup(popupReporte(r))

markers.addLayer(marker)

})

actualizarEstadisticas(data)

})

}

cargarReportes()

navigator.geolocation.getCurrentPosition(pos=>{

const lat=pos.coords.latitude
const lng=pos.coords.longitude

map.setView([lat,lng],15)

L.marker([lat,lng]).addTo(map)

})

const subtipos={

"Bache":["Grieta","Bache","Bache-son","Reparacion inconclusa"],
"Basura":["Acumulacion de basura","No paso recoleccion"],
"Drenaje":["Aguas negras","Alcantarilla tapada"],
"Agua":["Fuga de agua","No hay agua"],
"Luminaria":["Apagada","Parpadeando"]

}

const categoriaSelect=document.getElementById("categoria")
const subtipoSelect=document.getElementById("subtipo")

function actualizarSubtipos(){

let cat=categoriaSelect.value

subtipoSelect.innerHTML=""

subtipos[cat].forEach(s=>{

let option=document.createElement("option")
option.value=s
option.text=s

subtipoSelect.appendChild(option)

})

}

categoriaSelect.addEventListener("change",actualizarSubtipos)

actualizarSubtipos()

document.getElementById("btnUbicar").onclick=()=>{

categoria=categoriaSelect.value
subtipo=subtipoSelect.value

modoReporte=true

alert("Haz clic en el mapa para ubicar el reporte")

}

map.on("click",(e)=>{

if(!modoReporte) return

modoReporte=false

const lat=e.latlng.lat
const lng=e.latlng.lng

const foto=document.getElementById("foto").files[0]

const form=new FormData()

form.append("categoria",categoria+" - "+subtipo)
form.append("descripcion",subtipo)
form.append("lat",lat)
form.append("lng",lng)

if(foto) form.append("foto",foto)

fetch("/reporte",{

method:"POST",
body:form

})
.then(res=>res.json())
.then(()=>{

alert("Reporte enviado")

cargarReportes()

})

})

document.addEventListener("DOMContentLoaded",()=>{

document.querySelector(".stat-bache")
.addEventListener("click",()=>{
window.location.href="estadisticas.html?tipo=Bache"
})

document.querySelector(".stat-basura")
.addEventListener("click",()=>{
window.location.href="estadisticas.html?tipo=Basura"
})

document.querySelector(".stat-drenaje")
.addEventListener("click",()=>{
window.location.href="estadisticas.html?tipo=Drenaje"
})

})