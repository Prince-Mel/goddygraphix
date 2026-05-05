const pool = require('./db');
async function test() {
    const id = 1;
    await pool.query("UPDATE services SET visible = ? WHERE id = ?", [false, id]);
    const [rows1] = await pool.query("SELECT visible FROM services WHERE id = ?", [id]);
    console.log("After setting to false (boolean):", rows1[0].visible);
    
    await pool.query("UPDATE services SET visible = ? WHERE id = ?", [true, id]);
    const [rows2] = await pool.query("SELECT visible FROM services WHERE id = ?", [id]);
    console.log("After setting to true (boolean):", rows2[0].visible);

    process.exit(0);
}
test();
