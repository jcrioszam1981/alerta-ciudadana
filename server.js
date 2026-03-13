const express = require("express")
const multer = require("multer")
const sqlite3 = require("sqlite3").verbose()
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static("public"))
app.use("/uploads", express.static("uploads"))

const db = new sqlite3.Database("./db/database.db")

db.run(`
CREATE TABLE IF NOT EXISTS reportes (
id INTEGER PRIMARY KEY AUTOINCREMENT,
categoria TEXT,
descripcion TEXT,
lat REAL,
lng REAL,
foto TEXT,
fecha DATETIME DEFAULT CURRENT_TIMESTAMP
)
`)

const storage = multer.diskStorage({
destination: "uploads/",
filename: (req,file,cb)=>{
cb(null,Date.now()+"_"+file.originalname)
}
})

const upload = multer({storage})

app.post("/reporte", upload.single("foto"), (req,res)=>{

const {categoria,descripcion,lat,lng} = req.body
const foto = req.file ? req.file.filename : null

db.run(
`INSERT INTO reportes (categoria,descripcion,lat,lng,foto) VALUES (?,?,?,?,?)`,
[categoria,descripcion,lat,lng,foto],
function(err){

if(err){
return res.status(500).json(err)
}

res.json({ok:true})

})

})

app.get("/reportes",(req,res)=>{

db.all("SELECT * FROM reportes",(err,rows)=>{

if(err){
return res.status(500).json(err)
}

res.json(rows)

})

})

app.listen(3000,()=>{
console.log("Servidor en http://localhost:3000")
})