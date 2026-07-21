let cellWorld = {
  "title": "Smooth curve going through the control points",
  "id": "world.cell",
  "pathStyles": [
    {
      "id": "zero",
      "radius": 0,
      "width": 50,
      "straightEdgeWidth": 0,
      "strength": 0,
      "features": 5,
      "innerFont": "70% Arial",
      "fill": "#f918",
      "outline": "#a51a"
    }
  ],
  "edgeStyles": [
    {
      "id": "arrow1",
      "angle": 0,
      "width": 20,
      "startEndType": "[",
      "endEndType": "]",
      "startSlant": 0,
      "endSlant": 0,
      "fill": "#79d8",
      "outline": "#579a",
      "dot": "#f70"
    },
    {
      "id": "arrow2",
      "angle": 20,
      "width": 20,
      "startEndType": ">",
      "endEndType": ">",
      "startSlant": 0,
      "endSlant": 0,
      "fill": "#f918",
      "outline": "#a51a"
    }
  ],
  "pointStyles": [
    {
      "id": "emoji",
      "radius": 8,
      "innerFont": "70% Arial",
      "strength": 0,
      "fill": "#fffa",
      "outline": "#a51a"
    },
    {
      "id": "emoji2",
      "radius": 8,
      "innerFont": "8px Arial",
      "fill": "#ffffff80",
      "outline": "#333333"
    },
    {
      "id": "mrk",
      "radius": 5,
      "fill": "#ff8844",
      "outline": "#ffffff"
    },
    {
      "id": "pt",
      "radius": 5,
      "fill": "#0000ff",
      "outline": "#00000000"
    }
  ],
  "nodes": [
    {
      "id": "p1",
      "x": 120,
      "y": 200,
      "name": "Start Point"
    },
    {
      "id": "p2",
      "x": 200,
      "y": 180,
      "name": "Middle Point",
      "style": "emoji2"
    },
    {
      "id": "p3",
      "x": 300,
      "y": 130,
      "name": "3"
    },
    {
      "id": "p4",
      "x": 400,
      "y": 160,
      "name": "4"
    },
    {
      "id": "p5",
      "x": 500,
      "y": 170,
      "name": "5"
    },
    {
      "id": "p6",
      "x": 600,
      "y": 180,
      "name": "6"
    },
    {
      "id": "p7",
      "x": 700,
      "y": 200,
      "name": "7"
    },
    {
      "id": "p8",
      "x": 800,
      "y": 300,
      "name": "8"
    },
    {
      "id": "p9",
      "x": 700,
      "y": 500,
      "name": "9"
    },
    {
      "id": "p10",
      "x": 600,
      "y": 550,
      "name": "10"
    },
    {
      "id": "p11",
      "x": 500,
      "y": 560,
      "name": "11"
    },
    {
      "id": "p12",
      "x": 400,
      "y": 500,
      "name": "12"
    },
    {
      "id": "p13",
      "x": 300,
      "y": 450,
      "name": "13"
    },
    {
      "id": "p14",
      "x": 200,
      "y": 400,
      "name": "14"
    },
    {
      "id": "p15",
      "x": 100,
      "y": 350,
      "name": "15"
    },
    {
      "id": "p16",
      "x": 100,
      "y": 300,
      "name": "End Point"
    }
  ],
  "connections": [
    {
      "from": "p1",
      "to": "p2",
      "style": "arrow1"
    },
    {
      "from": "p2",
      "to": "p3",
      "style": "arrow2"
    },
    {
      "from": "p3",
      "to": "p4",
      "style": "arrow2"
    },
    {
      "from": "p4",
      "to": "p5",
      "style": "arrow2"
    },
    {
      "from": "p5",
      "to": "p1",
      "style": "arrow2"
    }
  ],
  "sequence": [
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
    "p8",
    "p9",
    "p10",
    "p11",
    "p12",
    "p13",
    "p14",
    "p15",
    "p16"
  ],
  "layers": [
    {
      "type": "jatex",
      "spacing": 60
    },
    {
      "type": "sequence",
      "style": "zero"
    }
  ]
};

export { cellWorld };
