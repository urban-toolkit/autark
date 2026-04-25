# Autark: A Serverless Toolkit for Prototyping Urban Visual Analytics Systems
<div align="center">
  <img src="../logo.png" alt="Autark Logo" height="200"/></br>
</div>
<br>

**Autark** is a modular and serverless toolkit built in TypeScript to streamline the implementation and deployment of urban visual analytics systems. 

It provides a client-side platform for the complete implementation of urban visual analytics systems. It supports loading, storing, querying, joining, and exporting both physical and thematic urban data using standard formats like OpenStreetMap, GeoJSON, and GeoTIFF. Employing GPU acceleration, it allows for fast implementations of urban analysis algorithms. Finally, it provides a collection of interactive plots and a 3D map for visualizing urban data.

Autark is composed of four modules:

* `autk-db`: A spatial database that handles physical and thematic urban datasets.
* `autk-compute`: a WebGPU based general-purpose computation engine to implement general-purpose algorithms using physical and thematic data.
* `autk-map`: A map visualization library that allows the exploration of 2D and 3D physical and thematical layers.
* `autk-plot`: A d3.js based plot library designed to consume urban data in standard formats and create linked views.

For demonstration purposes and to facilitate the adoption of Autark, we created a large collection of simple examples illustrating the core functionalities of each module. We also provide several examples on how to combine several modules to build complex applications. All examples are organized in the `example/` directory.

# autk-map

**autk-map** is a 3D map visualization library, part of the Autark ecosystem, built using [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API). The library currently loads GeoJSON-derived vector layers and GeoTIFF-derived raster layers. The library can be used standalone or in conjunction with other Autark modules. To facilitate adoption, we provide a large collection of examples in the [Autark website](https://autarkjs.org/gallery/), demonstrating its functionalities both as an independent library and as part of the larger ecosystem of tools for urban data analytics.

## Resources

- [Documentation](https://autarkjs.org/introduction.html)
- [Examples](https://autarkjs.org/gallery/)
- [Use Cases](https://autarkjs.org/usecases/)
