const pool = require('./db');

async function testToggle() {
    try {
        const id = 1;
        // Get current state
        const [rows] = await pool.query("SELECT visible FROM services WHERE id = ?", [id]);
        const currentVisible = rows[0].visible;
        const nextVisible = currentVisible ? 0 : 1;
        
        console.log(`Current visibility for ID ${id}: ${currentVisible}. Toggling to ${nextVisible}...`);
        
        const [result] = await pool.query("UPDATE services SET visible = ? WHERE id = ?", [nextVisible, id]);
        console.log(`Update result:`, result);
        
        const [rowsAfter] = await pool.query("SELECT visible FROM services WHERE id = ?", [id]);
        console.log(`New visibility for ID ${id}: ${rowsAfter[0].visible}`);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testToggle();
