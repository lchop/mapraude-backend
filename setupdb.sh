# Database Setup Script for Maraude Tracker

echo "🗄️  Setting up PostgreSQL database for Maraude Tracker..."

# 1. Create the database
echo "Creating database..."
createdb maraude_tracker

# 2. Create a dedicated user (optional but recommended)
echo "Creating database user..."
psql postgres -c "CREATE USER maraude_user WITH PASSWORD 'maraude_password';"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE maraude_tracker TO maraude_user;"
psql postgres -c "ALTER USER maraude_user CREATEDB;"

# 3. Connect to the database and create extensions
echo "Setting up database extensions..."
psql maraude_tracker -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

# 4. Test connection
echo "Testing database connection..."
psql maraude_tracker -c "SELECT version();"

echo "✅ Database setup completed!"
echo ""
echo "📝 Database connection details:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: maraude_tracker"
echo "   Username: maraude_user"
echo "   Password: maraude_password"
echo ""
echo "🔧 Next steps:"
echo "   1. Copy .env.example to .env"
echo "   2. Update database credentials in .env file"
echo "   3. Run 'npm run dev' to start the server"