fetch("/reportes")

.then(res=>res.json())

.then(data=>{

/* CONTADORES */

const categorias={
"Bache":0,
"Basura":0,
"Drenaje":0,
"Agua":0,
"Luminaria":0
}

data.forEach(r=>{

if(r.categoria.includes("Bache")) categorias["Bache"]++
else if(r.categoria.includes("Basura")) categorias["Basura"]++
else if(r.categoria.includes("Drenaje")) categorias["Drenaje"]++
else if(r.categoria.includes("Agua")) categorias["Agua"]++
else if(r.categoria.includes("Luminaria")) categorias["Luminaria"]++

})

const total =
categorias["Bache"]+
categorias["Basura"]+
categorias["Drenaje"]+
categorias["Agua"]+
categorias["Luminaria"]

document.getElementById("total").innerText=total
document.getElementById("baches").innerText=categorias["Bache"]
document.getElementById("basura").innerText=categorias["Basura"]
document.getElementById("drenaje").innerText=categorias["Drenaje"]
document.getElementById("agua").innerText=categorias["Agua"]
document.getElementById("luminaria").innerText=categorias["Luminaria"]

document.getElementById("kpiTotal").innerText=total

const promedio=(total/5).toFixed(1)

document.getElementById("kpiPromedio").innerText=promedio

let principal=Object.keys(categorias)
.reduce((a,b)=>categorias[a]>categorias[b]?a:b)

document.getElementById("kpiPrincipal").innerText=principal

/* GRAFICA GENERAL */

new Chart(document.getElementById("graficaReportes"),{

type:'bar',

data:{
labels:["Baches","Basura","Drenaje","Agua","Luminarias"],
datasets:[{
data:[
categorias["Bache"],
categorias["Basura"],
categorias["Drenaje"],
categorias["Agua"],
categorias["Luminaria"]
],
backgroundColor:["#1f3b63","#3a6ea5","#5fa8d3","#89c2d9","#cdb4db"]
}]
},

options:{plugins:{legend:{display:false}}}

})

/* GRAFICA POR MES */

let meses={}

data.forEach(r=>{

let fecha=new Date(r.fecha||Date.now())

let mes=fecha.getMonth()+1

if(!meses[mes]) meses[mes]=0

meses[mes]++

})

new Chart(document.getElementById("graficaMes"),{

type:'line',

data:{
labels:Object.keys(meses),
datasets:[{
label:"Reportes por mes",
data:Object.values(meses),
borderColor:"#1f3b63",
fill:false
}]
}

})

/* MAPA DE CALOR */

let map=L.map('heatmap').setView([27.07,-109.44],13)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

data.forEach(r=>{

if(!r.lat||!r.lng) return

L.circle([r.lat,r.lng],{

radius:80,
color:"red",
fillOpacity:0.4

}).addTo(map)

})

/* RANKING CALLES */

let calles={}

data.forEach(r=>{

if(!r.direccion) return

if(!calles[r.direccion]) calles[r.direccion]=0

calles[r.direccion]++

})

const ranking=document.getElementById("rankingCalles")

Object.entries(calles)
.sort((a,b)=>b[1]-a[1])
.slice(0,5)
.forEach(c=>{

const div=document.createElement("div")

div.className="report-row"

div.innerHTML=`<span>${c[0]}</span><span>${c[1]} reportes</span>`

ranking.appendChild(div)

})

/* REPORTES RECIENTES */

const top=document.getElementById("topReportes")

data.slice(-5).reverse().forEach(r=>{

const div=document.createElement("div")

div.className="report-row"

div.innerHTML=`<span>${r.categoria}</span><span>Reporte ciudadano</span>`

top.appendChild(div)

})

/* TIPOS DETALLADOS */

let tipos={}

data.forEach(r=>{

if(!tipos[r.categoria]) tipos[r.categoria]=0

tipos[r.categoria]++

})

const grid=document.getElementById("tiposGrid")

Object.keys(tipos).forEach(t=>{

const div=document.createElement("div")

div.className="tipo"

div.innerHTML=`<strong>${tipos[t]}</strong><br>${t}`

grid.appendChild(div)

})

/* FOTOS */

const fotos=document.getElementById("fotos")

data.forEach(r=>{

if(!r.foto) return

const div=document.createElement("div")

div.className="reporte-card"

div.innerHTML=`
<img src="/uploads/${r.foto}">
<div class="reporte-body"><strong>${r.categoria}</strong></div>
`

fotos.appendChild(div)

})

})