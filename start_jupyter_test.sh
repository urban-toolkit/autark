#!/bin/bash
# Quick start script for Jupyter testing

echo "🚀 Starting Autark Jupyter Test Environment"
echo ""

# Check if we're in the right directory
if [ ! -f "PYTHON_API_IMPLEMENTATION.md" ]; then
    echo "❌ Error: Please run this script from the repo root (/Users/csilva/src/autark)"
    exit 1
fi

# Check if runtime is built
if [ ! -f "autk-runtime/dist/autk-runtime.js" ]; then
    echo "⚠️  Runtime not built. Building now..."
    cd autk-runtime
    npm run build
    cd ..
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping server..."
    kill $SERVER_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM

# Start CORS-enabled HTTP server
echo "📡 Starting CORS-enabled HTTP server on port 8000..."
python cors_server.py 8000 > /tmp/autark-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Check if server started
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "❌ Failed to start server. Check /tmp/autark-server.log"
    exit 1
fi

echo "✅ Server running (PID: $SERVER_PID)"
echo "   - Runtime: http://localhost:8000/autk-runtime/dist/autk-runtime.js"
echo "   - Data: http://localhost:8000/examples/data/"
echo ""

# Choose Jupyter environment
echo "Choose Jupyter environment:"
echo "  1) Jupyter Notebook (classic)"
echo "  2) JupyterLab (modern)"
echo "  3) Open in VS Code"
echo "  4) Just run server (no Jupyter)"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo "🎯 Starting Jupyter Notebook..."
        cd python/examples
        jupyter notebook test_jupyter_integration.ipynb
        ;;
    2)
        echo "🎯 Starting JupyterLab..."
        cd python/examples
        jupyter lab test_jupyter_integration.ipynb
        ;;
    3)
        echo "🎯 Opening in VS Code..."
        code python/examples/test_jupyter_integration.ipynb
        echo "📝 Server is still running. Press Ctrl+C when done."
        wait $SERVER_PID
        ;;
    4)
        echo "📝 Server is running. You can now:"
        echo "   - Open Jupyter manually"
        echo "   - Test at http://localhost:8000/test-jupyter.html"
        echo ""
        echo "Press Ctrl+C to stop the server."
        wait $SERVER_PID
        ;;
    *)
        echo "❌ Invalid choice"
        cleanup
        ;;
esac

cleanup
