module.exports = {
  apps: [
    {
      name: "emis",
      script: "./app.js",
      instances: "max",        // ใช้ทุก CPU core (หรือใส่ตัวเลขเช่น 2, 4)
      exec_mode: "cluster",    // รันแบบ cluster mode
      watch: false,            // true = restart เมื่อไฟล์เปลี่ยน
      max_memory_restart: "500M",
      env: {                   // Environment Variables (Development)
        NODE_ENV: "development",
        PORT: 4000
      },
      env_production: {        // Environment Variables (Production)
        NODE_ENV: "production",
        PORT: 9090
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      merge_logs: true
    }
  ]
};