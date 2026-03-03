import { Loader } from '@react-three/drei';
import EarthScene from './components/EarthScene';
import { Globe2, Info, AlertTriangle } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-black text-white p-6">
      <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
      <h2 className="text-2xl font-bold mb-2">Failed to load 3D Scene</h2>
      <p className="text-gray-400 text-center max-w-md mb-4">
        {error.message}
      </p>
      <p className="text-sm text-gray-500">
        This is usually caused by network issues or blocked texture URLs.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <div className="w-full h-screen overflow-hidden bg-black text-white font-sans">
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <EarthScene />
      </ErrorBoundary>
      
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-6 pointer-events-none flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-light tracking-tight flex items-center gap-3">
            <Globe2 className="w-8 h-8 text-blue-400" />
            Interactive Earth
          </h1>
          <p className="text-gray-400 mt-2 text-sm max-w-md">
            Drag to rotate the Earth. Scroll to zoom in and out.
            Observe the terminator line separating day and night, 
            and watch the city lights illuminate the dark side.
          </p>
        </div>
        
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 flex items-center gap-3">
          <Info className="w-5 h-5 text-blue-300" />
          <div className="text-xs text-gray-300">
            <span className="block font-semibold text-white">Live Simulation</span>
            Sun & Moon positioned in space
          </div>
        </div>
      </div>

      <Loader 
        containerStyles={{ background: '#000' }}
        innerStyles={{ width: '300px' }}
        barStyles={{ background: '#3b82f6' }}
        dataStyles={{ color: '#fff', fontSize: '14px', fontFamily: 'sans-serif' }}
        dataInterpolation={(p) => `Loading Textures ${p.toFixed(0)}%`}
      />
    </div>
  );
}
