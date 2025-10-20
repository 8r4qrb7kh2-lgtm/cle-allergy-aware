#!/bin/bash

# Clarivore WordPress Test Site Setup Script
# This script helps you choose and set up a WordPress test environment

echo "╔═══════════════════════════════════════════════════╗"
echo "║   Clarivore WordPress Plugin Test Setup         ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Check if Docker is installed
if command -v docker &> /dev/null; then
    HAS_DOCKER=true
    echo "✓ Docker is installed"
else
    HAS_DOCKER=false
    echo "✗ Docker is not installed"
fi

# Check if Local by Flywheel is installed
if [ -d "/Applications/Local.app" ]; then
    HAS_LOCAL=true
    echo "✓ Local by Flywheel is installed"
else
    HAS_LOCAL=false
    echo "✗ Local by Flywheel is not installed"
fi

# Check if MAMP is installed
if [ -d "/Applications/MAMP" ]; then
    HAS_MAMP=true
    echo "✓ MAMP is installed"
else
    HAS_MAMP=false
    echo "✗ MAMP is not installed"
fi

echo ""
echo "════════════════════════════════════════════════════"
echo "Choose your WordPress test environment:"
echo "════════════════════════════════════════════════════"
echo ""

if [ "$HAS_DOCKER" = true ]; then
    echo "1) Docker (Recommended - Fast & Isolated)"
fi

if [ "$HAS_LOCAL" = true ]; then
    echo "2) Local by Flywheel (Easiest - GUI)"
fi

if [ "$HAS_MAMP" = true ]; then
    echo "3) MAMP (Traditional)"
fi

echo "4) Help me install one"
echo "5) Manual setup instructions"
echo "0) Exit"
echo ""
read -p "Enter your choice: " choice

case $choice in
    1)
        if [ "$HAS_DOCKER" = true ]; then
            echo ""
            echo "Starting WordPress with Docker..."
            docker-compose up -d
            echo ""
            echo "✓ WordPress is starting!"
            echo ""
            echo "Next steps:"
            echo "1. Wait 30 seconds for MySQL to initialize"
            echo "2. Visit: http://localhost:8080"
            echo "3. Complete WordPress installation"
            echo "4. Go to Plugins and activate Clarivore"
            echo ""
            echo "Full instructions: See DOCKER-SETUP.md"
        else
            echo "Docker is not installed. Choose option 4 for help."
        fi
        ;;
    2)
        if [ "$HAS_LOCAL" = true ]; then
            echo ""
            echo "Opening Local by Flywheel..."
            open -a "Local"
            echo ""
            echo "In Local:"
            echo "1. Click 'Create a new site'"
            echo "2. Name it 'clarivore-test'"
            echo "3. After creation, copy plugin to:"
            echo "   ~/Local Sites/clarivore-test/app/public/wp-content/plugins/"
            echo ""
            echo "Then run this command:"
            echo "cp -r clarivore-menu-integration ~/Local\ Sites/clarivore-test/app/public/wp-content/plugins/"
        else
            echo "Local by Flywheel is not installed. Choose option 4 for help."
        fi
        ;;
    3)
        if [ "$HAS_MAMP" = true ]; then
            echo ""
            echo "Opening MAMP..."
            open -a "MAMP"
            echo ""
            echo "In MAMP:"
            echo "1. Start servers"
            echo "2. Download WordPress from wordpress.org"
            echo "3. Extract to /Applications/MAMP/htdocs/wordpress/"
            echo "4. Visit http://localhost:8888/wordpress"
            echo "5. Complete WordPress installation"
            echo "6. Copy plugin to htdocs/wordpress/wp-content/plugins/"
        else
            echo "MAMP is not installed. Choose option 4 for help."
        fi
        ;;
    4)
        echo ""
        echo "Installation Options:"
        echo ""
        echo "╔══════════════════════════════════════════════╗"
        echo "║  EASIEST: Local by Flywheel                 ║"
        echo "╚══════════════════════════════════════════════╝"
        echo "Download: https://localwp.com/"
        echo "- Free, visual interface"
        echo "- No configuration needed"
        echo "- Best for non-developers"
        echo ""
        echo "╔══════════════════════════════════════════════╗"
        echo "║  FASTEST: Docker                            ║"
        echo "╚══════════════════════════════════════════════╝"
        echo "Download: https://www.docker.com/products/docker-desktop/"
        echo "- One command to start"
        echo "- Isolated environment"
        echo "- Best for developers"
        echo ""
        echo "╔══════════════════════════════════════════════╗"
        echo "║  TRADITIONAL: MAMP                          ║"
        echo "╚══════════════════════════════════════════════╝"
        echo "Download: https://www.mamp.info/"
        echo "- Classic Apache/MySQL setup"
        echo "- GUI for managing servers"
        echo "- Best if you already use it"
        echo ""
        ;;
    5)
        echo ""
        echo "Manual Setup Instructions:"
        echo ""
        echo "See these files for detailed instructions:"
        echo "- DOCKER-SETUP.md (for Docker setup)"
        echo "- clarivore-menu-integration/INSTALL.md (for plugin installation)"
        echo "- clarivore-menu-integration/README.md (full documentation)"
        echo ""
        ;;
    0)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "Invalid choice"
        ;;
esac

echo ""
echo "Need help? Check the documentation:"
echo "- DOCKER-SETUP.md"
echo "- clarivore-menu-integration/INSTALL.md"
echo "- clarivore-menu-integration/README.md"
echo ""
