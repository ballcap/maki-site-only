const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =========================
// PostgreSQL Connection
// =========================
const pool = new Pool({
  user: "hospital_ns0h_user",
  host: "dpg-d4s37cq4d50c73b7kme0-a.singapore-postgres.render.com",
  database: "hospital_ns0h",
  password: "ObsmhwJipF9RclOcZV4PuAwh5sPe5Rzy",
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

// small helper for errors
function handleError(res, err){
  console.error(err);
  res.status(500).json({ error: err.message || String(err) });
}

//endpoints
app.get('/iv-drop', (req, res) => {
  res.render('iv-drop');
});

// =========================
// GET latest record for all patients
// =========================
app.get("/injection/all", async (req, res) => {
  const sql = `
    SELECT 
      p.patientid, 
      p.name,
      r.recordid,
      r.facility,
      r.type,
      r.startdate,
      r.stopdate,
      r.nextdate,
      r.note
    FROM injection_patients p
    JOIN injection_records r 
      ON p.patientid = r.patientid
    WHERE r.recordid IN (
      SELECT MAX(recordid)
      FROM injection_records
      GROUP BY patientid
    )
    ORDER BY p.patientid;
  `;
  try{
    const result = await pool.query(sql);
    res.json(result.rows);
  }catch(err){
    handleError(res, err);
  }
});

// =========================
// GET full history of one patient
// =========================
app.get("/injection/history/:id", async (req, res) => {
  const sql = `
    SELECT 
      r.recordid,
      r.patientid,
      p.name,
      r.facility,
      r.type,
      r.startdate,
      r.stopdate,
      r.nextdate,
      r.note
    FROM injection_records r
    LEFT JOIN injection_patients p
      ON r.patientid = p.patientid
    WHERE r.patientid = $1
    ORDER BY r.recordid;
  `;
  try{
    const result = await pool.query(sql, [req.params.id]);
    res.json(result.rows);
  }catch(err){
    handleError(res, err);
  }
});

// =========================
// ADD new patient + record
// =========================
app.post("/injection/add", async (req, res) => {
  try {
    const { id, name, record } = req.body;

    if (!id || !record)
      return res.status(400).json({ error: "invalid body" });

    // Fix dates: convert "中止" or "" into NULL
    const fixedStart =
      record.start === "中止" || record.start === "" ? null : record.start;

    const fixedStop =
      record.stop === "中止" || record.stop === "" ? null : record.stop;

    const fixedNext =
      record.next === "中止" || record.next === "" ? null : record.next;

    // Insert or update patient
    await pool.query(
      `INSERT INTO injection_patients (patientid, name)
       VALUES ($1, $2)
       ON CONFLICT (patientid)
       DO UPDATE SET name = EXCLUDED.name`,
      [id, name || null]
    );

    // Insert new injection record
    await pool.query(
      `INSERT INTO injection_records
        (patientid, facility, type, startdate, stopdate, nextdate, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        record.facility || null,
        record.type || null,
        fixedStart,
        fixedStop,
        fixedNext,
        record.note || null
      ]
    );

    res.json({ status: "ok" });
  } catch (err) {
    handleError(res, err);
  }
});

// =========================
// UPDATE existing record
// =========================
app.put("/injection/update", async (req, res) => {
  try{
    const { recordid, record } = req.body;
    if(!recordid || !record) return res.status(400).json({ error: "invalid body" });

    await pool.query(
      `UPDATE injection_records SET
          facility = $1,
          type     = $2,
          startdate = $3,
          stopdate  = $4,
          nextdate  = $5,
          note      = $6
       WHERE recordid = $7`,
      [
        record.facility || null,
        record.type || null,
        record.start || null,
        record.stop || null,
        record.next || null,
        record.note || null,
        recordid
      ]
    );

    res.json({ status: "updated" });
  }catch(err){
    handleError(res, err);
  }
});

// =========================
// DELETE all records → patient
// =========================
app.delete("/injection/patient/:id", async (req, res) => {
  const id = req.params.id;
  try{
    await pool.query("DELETE FROM injection_records WHERE patientid = $1", [id]);
    await pool.query("DELETE FROM injection_patients WHERE patientid = $1", [id]);
    res.json({ status: "deleted" });
  }catch(err){
    handleError(res, err);
  }
});

// =========================
// DELETE one record
// =========================
app.delete("/injection/record/:recordid", async (req, res) => {
  try{
    await pool.query("DELETE FROM injection_records WHERE recordid = $1", [req.params.recordid]);
    res.json({ status: "record deleted" });
  }catch(err){
    handleError(res, err);
  }
});

// =========================
// Server Start
// =========================
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
