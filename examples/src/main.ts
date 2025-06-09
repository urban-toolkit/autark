import { OsmLoadPbf } from './utkdb/osm-load-pbf';

window.onload = async () => {
  const example = new OsmLoadPbf();

    example.buildHtmlNodes();
    await example.run();
    await example.print();
}