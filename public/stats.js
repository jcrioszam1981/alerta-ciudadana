const params=new URLSearchParams(window.location.search)

const tipo=params.get("tipo")

document.getElementById("titulo").innerText="Estadísticas de "+tipo

fetch("/reportes")
.then(res=>res.json())
.then(data=>{

let filtrados=data.filter(r=>r.categoria.toLowerCase().includes(tipo))

document.getElementById("total").innerText=filtrados.length

let conFoto=filtrados.filter(r=>r.foto)
let sinFoto=filtrados.filter(r=>!r.foto)

document.getElementById("conFoto").innerText=conFoto.length
document.getElementById("sinFoto").innerText=sinFoto.length

let lista=document.getElementById("listaReportes")

filtrados.slice(0,12).forEach(r=>{

let html=`

<div class="cardTipo">

<img src="${r.foto ? "/uploads/"+r.foto :
"https://cdn-icons-png.flaticon.com/512/565/565491.png"}">

<h3>${r.categoria}</h3>

<p>${r.descripcion || ""}</p>

</div>

`

lista.innerHTML+=html

})

})