const express = require("express");
const router = express.Router();
const Application = require("../../models/Application");

const { createZBIORCZA_TP } = require("../../utils/create-zbiorcza-tp");

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

    res.json(201, {
      data: application,
      zbiorcza: zbiorcza_TP,
    });
  } catch (e) {
    res.json(400, { message: e, error: e });
  }
});

module.exports = router;
