const express = require("express");
const router = express.Router();
const Application = require("../../models/Application");

const { createZBIORCZA_TP } = require("../../utils/create-zbiorcza-tp");
const Products = require("../../models/Products");

router.post("/", async function (req, res, next) {
  const data = req.body;

  try {
    const application = await Application.create(data);
    application.save();

    res.json(201, {
      message: `Formularz został wysłany!, numer referencyjny: ${application._id}`,
      id: application._id,
    });
  } catch (e) {
    res.json(400, { message: e, error: e });
  }
});

router.get("/preview/:id", async function (req, res, next) {
  const id = req.params.id;

  try {
    const application = await Application.findById(id);
    const zbiorcza_TP = createZBIORCZA_TP(application);

    if (!application) {
      res.json(404, { message: "Nie znaleziono formularza!" });
    }

    const main_keys = Object.keys(zbiorcza_TP.main_keys);

    // SPIRAL >> STANDARD >> MAX

    // ======================================================================
    //
    // 1. SPIRAL
    //
    // ======================================================================

    const keys_spiral = Object.keys(zbiorcza_TP.m_spiral);
    const values_spiral = Object.values(zbiorcza_TP.m_spiral);

    const pipeline_spiral = [
      {
        $match: { height_mm: { $in: keys_spiral }, type: application.type },
      },
      {
        $addFields: {
          sortKey: {
            $switch: {
              branches: keys_spiral.map((key, index) => ({
                case: { $eq: ["$height_mm", key] },
                then: index,
              })),
              default: keys_spiral.length, // Ensures any unmatched documents appear last
            },
          },
          count: {
            $arrayElemAt: [
              values_spiral,
              {
                $indexOfArray: [keys_spiral, "$height_mm"],
              },
            ],
          },
        },
      },
      {
        $sort: { sortKey: 1 },
      },
      {
        $project: { sortKey: 0 }, // Remove the sortKey field from the final output
      },
    ];

    const products_spiral = await Products.aggregate(pipeline_spiral);

    // ======================================================================
    //
    // 2. STANDARD
    //
    // ======================================================================

    const keys_standard = Object.keys(zbiorcza_TP.m_standard);
    const values_standard = Object.values(zbiorcza_TP.m_standard);

    const pipeline_standard = [
      {
        $match: { height_mm: { $in: keys_standard }, type: application.type },
      },
      {
        $addFields: {
          sortKey: {
            $switch: {
              branches: keys_standard.map((key, index) => ({
                case: { $eq: ["$height_mm", key] },
                then: index,
              })),
              default: keys_standard.length, // Ensures any unmatched documents appear last
            },
          },
          count: {
            $arrayElemAt: [
              values_standard,
              {
                $indexOfArray: [keys_standard, "$height_mm"],
              },
            ],
          },
        },
      },
      {
        $sort: { sortKey: 1 },
      },
      {
        $project: { sortKey: 0 }, // Remove the sortKey field from the final output
      },
    ];

    const products_standard = await Products.aggregate(pipeline_standard);

    // ======================================================================
    //
    // 3 MAX
    //
    // ======================================================================

    const keys_max = Object.keys(zbiorcza_TP.m_max);
    const values_max = Object.values(zbiorcza_TP.m_max);

    const pipeline_max = [
      {
        $match: { height_mm: { $in: keys_max }, type: application.type },
      },
      {
        $addFields: {
          sortKey: {
            $switch: {
              branches: keys_max.map((key, index) => ({
                case: { $eq: ["$height_mm", key] },
                then: index,
              })),
              default: keys_max.length, // Ensures any unmatched documents appear last
            },
          },
          count: {
            $arrayElemAt: [
              values_max,
              {
                $indexOfArray: [keys_max, "$height_mm"],
              },
            ],
          },
        },
      },
      {
        $sort: { sortKey: 1 },
      },
      {
        $project: { sortKey: 0 }, // Remove the sortKey field from the final output
      },
    ];

    const products_max = await Products.aggregate(pipeline_max);

    // ======================================================================
    //
    // NUMBER VALUES
    //
    // ======================================================================

    res.status(200).json({
      // products_spiral,
      // products_standard,
      // products_max,
      zbiorcza_TP: zbiorcza_TP,
    });
  } catch (e) {
    res.status(400).json({ message: e, error: e });
  }
});

module.exports = router;
