import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { computeOrigin, lonLatToCrs } from '@urban-toolkit/autk-core';
import { onExampleDispose, runExample } from '../example';
import { CAMERA_TOUR_ROUTE } from './camera-tour-route';

const BASE_URL = (import.meta as any).env.BASE_URL;
const BBOX: [number, number, number, number] = [-74.019, 40.700, -74.003, 40.714];
const DRIVE_SECONDS = 42;
const TURN_SECONDS = 8;
const RISE_SECONDS = 20;
const EYE_HEIGHT = 12;
const LOOK_AHEAD = 45;
type Point = [number, number];

async function main(): Promise<void> {
    const db = new AutkDb();
    await db.init();
    await db.loadOsm({
        pbfFileUrl: `${BASE_URL}data/lower_mnt.osm.pbf`,
        queryArea: { bbox: BBOX },
        autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
    });

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!, { showUi: false });
    onExampleDispose(() => map.destroy());
    await map.init();
    // Load roads first so their bounds establish the origin used for the camera path.
    const roads = await db.getLayer('table_osm_roads');
    map.loadCollection('table_osm_roads', { collection: roads, type: 'roads' });
    for (const layer of db.getLayersMetadata()) {
        if (layer.name !== 'table_osm_roads') {
            map.loadCollection(layer.name, { collection: await db.getLayer(layer.name), type: layer.type });
        }
    }

    const [originX, originY] = computeOrigin(roads);
    const toLocal = ([lon, lat]: Point): Point => {
        const [x, y] = lonLatToCrs(map.workspaceCrs, lon, lat);
        return [x - originX, y - originY];
    };
    const path = CAMERA_TOUR_ROUTE.map(toLocal);
    const distances = [0];
    for (let i = 1; i < path.length; i++) {
        distances.push(distances[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    }
    const total = distances[distances.length - 1];
    const sampleRoad = (distance: number): Point => {
        const d = Math.max(0, Math.min(distance, total));
        const index = distances.findIndex(value => value >= d);
        if (index <= 0) return path[0];
        const t = (d - distances[index - 1]) / (distances[index] - distances[index - 1]);
        return [path[index - 1][0] + (path[index][0] - path[index - 1][0]) * t,
            path[index - 1][1] + (path[index][1] - path[index - 1][1]) * t];
    };
    // Average nearby road positions to soften short bends without detouring off the route.
    const positionAt = (distance: number): Point => {
        const d = Math.max(0, Math.min(distance, total));
        const radius = Math.min(8, d, total - d);
        const before = sampleRoad(d - radius), current = sampleRoad(d), after = sampleRoad(d + radius);
        return [(before[0] + 2 * current[0] + after[0]) / 4,
            (before[1] + 2 * current[1] + after[1]) / 4];
    };
    // Derive an overview from the full query box, with extra distance for the tilted perspective.
    const southwest = lonLatToCrs(map.workspaceCrs, BBOX[0], BBOX[1]);
    const northeast = lonLatToCrs(map.workspaceCrs, BBOX[2], BBOX[3]);
    map.fitBounds([southwest[0], southwest[1], northeast[0], northeast[1]]);
    const overviewCenter = map.camera.getLookAt();
    const overviewDistance = map.camera.getEye()[2];
    const overviewEye = [overviewCenter[0], overviewCenter[1] - overviewDistance * 0.55, overviewDistance * 1.05];
    const end = path[path.length - 1];
    const beforeEnd = positionAt(total - LOOK_AHEAD / 2);
    const endHeading = Math.atan2(end[1] - beforeEnd[1], end[0] - beforeEnd[0]);
    const targetHeading = Math.atan2(overviewCenter[1] - end[1], overviewCenter[0] - end[0]);
    const headingDelta = Math.atan2(Math.sin(targetHeading - endHeading), Math.cos(targetHeading - endHeading));
    const ease = (t: number) => t * t * (3 - 2 * t);

    const status = document.querySelector<HTMLElement>('#map-status')!;
    const replay = document.querySelector<HTMLButtonElement>('#replay')!;
    let frame = 0;
    let startTime: number | undefined;
    let playing = false;
    map.draw();

    const animate = (time: number) => {
        if (!playing) return;
        startTime ??= time;
        const elapsed = (time - startTime) / 1000;
        if (elapsed < DRIVE_SECONDS) {
            const distance = ease(elapsed / DRIVE_SECONDS) * total;
            const position = positionAt(distance);
            // Look along a centered road tangent to keep turns gradual and avoid an end-of-path jump.
            const behind = positionAt(distance - LOOK_AHEAD / 2);
            const ahead = positionAt(distance + LOOK_AHEAD / 2);
            const angle = Math.atan2(ahead[1] - behind[1], ahead[0] - behind[0]);
            map.camera.resetCamera([0, 0, 1],
                [position[0] + Math.cos(angle) * LOOK_AHEAD, position[1] + Math.sin(angle) * LOOK_AHEAD, EYE_HEIGHT + 3],
                [position[0], position[1], EYE_HEIGHT]);
            status.textContent = 'Street-level drive';
        } else if (elapsed < DRIVE_SECONDS + TURN_SECONDS) {
            const t = ease((elapsed - DRIVE_SECONDS) / TURN_SECONDS);
            const angle = endHeading + headingDelta * t;
            map.camera.resetCamera([0, 0, 1],
                [end[0] + Math.cos(angle) * LOOK_AHEAD, end[1] + Math.sin(angle) * LOOK_AHEAD, EYE_HEIGHT + 3],
                [end[0], end[1], EYE_HEIGHT]);
            status.textContent = 'Turning to the skyline';
        } else {
            const t = ease(Math.min((elapsed - DRIVE_SECONDS - TURN_SECONDS) / RISE_SECONDS, 1));
            const startLook = [end[0] + Math.cos(targetHeading) * LOOK_AHEAD,
                end[1] + Math.sin(targetHeading) * LOOK_AHEAD, EYE_HEIGHT + 3];
            const eye = [end[0] + (overviewEye[0] - end[0]) * t,
                end[1] + (overviewEye[1] - end[1]) * t, EYE_HEIGHT + (overviewEye[2] - EYE_HEIGHT) * t];
            const look = startLook.map((value, axis) => value + (overviewCenter[axis] - value) * t);
            map.camera.resetCamera([0, 0, 1], look, eye);
            status.textContent = t < 1 ? 'Rising and tilting' : 'Overview · Replay available';
            if (t >= 1) {
                playing = false;
                replay.disabled = false;
            }
        }
        map.requestRender();
        if (playing) frame = requestAnimationFrame(animate);
    };

    const play = () => {
        cancelAnimationFrame(frame);
        playing = true;
        startTime = undefined;
        replay.disabled = true;
        frame = requestAnimationFrame(animate);
    };
    replay.addEventListener('click', play);
    onExampleDispose(() => { playing = false; cancelAnimationFrame(frame); });
    document.querySelector('.map-stage')?.setAttribute('aria-busy', 'false');
    play();
}
void runExample(main);
