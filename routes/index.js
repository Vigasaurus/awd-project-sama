const express = require('express');
const router = express.Router();
const flash = require('express-flash');
const sql = require('mssql');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
var moment = require('moment');
const axios = require('axios');
const discord = require('../discord/discord');

// Setup multer with disk storage
const multer = require('multer');
var storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, './public/images/profiles');
	},
	filename: function (req, file, cb) {
		cb(null, file.originalname.replace(/ /g, '_'));
	},
});

const multerFilter = (req, file, cb) => {
	if (file.mimetype.split('/')[1] === 'pdf') {
		cb(null, true);
	} else {
		cb(new Error('Not a PDF File!!'), false);
	}
};

var storage_newsletters = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, './public/newsletters');
	},
	filename: function (req, file, cb) {
		cb(null, file.originalname.replace(/ /g, '_'));
	},
});

var upload = multer({ storage: storage });
var upload_newsletter = multer({
	storage: storage_newsletters,
	fileFilter: multerFilter,
});

router.get('/', async function (req, res) {
	const events = [];
	let announcements;
	let dateString = new Date();
	dateString = dateString.toISOString();

	// Pull list of announcements
	await new sql.Request()
		.query(`SELECT TOP 5 * FROM tbl_announcement ORDER BY create_date DESC`)
		.then((result) => {
			announcements = result.recordset; // set announcements object
		})
		.catch((err) => {
			console.error(err);
			req.flash(
				'error',
				'Whoops! We ran into a problem grabbing announcements.'
			);

			res.render('index');
		});

	// query google calendar to get events starting happing during or after the current time, sort by creation date
	await axios
		.get(
			`https://www.googleapis.com/calendar/v3/calendars/${process.env.GCAL_ID}/events?key=${process.env.GCAL_API_KEY}&singleEvents=true&orderBy=startTime&timeMin=${dateString}`
		)
		.then(function (response) {
			const googleCalendarEvents = response.data.items.slice(0, 3); // only use the top 3 events

			googleCalendarEvents.forEach(function (event) {
				const gooogleEventStart = new Date(event.start.dateTime);

				// get the event date in mm/dd form
				const eventDate = gooogleEventStart.toLocaleDateString('en-US', {
					month: 'numeric',
					day: 'numeric',
				});

				let eventDateLong = gooogleEventStart.toLocaleDateString('en-US', {
					month: 'long',
				});

				// create a date string that has the mnonth written and the date ordinal i.e. (August 27th)
				eventDateLong = eventDateLong + ' ' + getDateOrdinal(gooogleEventStart);

				// Get a hh:mm am/pm time
				const eventTime = gooogleEventStart.toLocaleString('en-US', {
					hour: 'numeric',
					minute: 'numeric',
					hour12: true,
				});

				events.push({
					name: event.summary,
					date: eventDate,
					dateLong: eventDateLong,
					time: eventTime,
					description: event.description,
				});
			});
		})
		.catch(function (error) {
			console.error(error);
		});

	res.render('index', {
		data: {
			events: events,
			announcements: announcements,
		},
	});
});
router.get('/meetings', function (req, res) {
	res.render('meetings.ejs');
});
// router.get('/newsletter', function (req, res) {
// 	res.render('newsletter.ejs');
// });
router.get('/terms-and-conditions', function (req, res) {
	res.render('terms-and-conditions');
});

router.get('/privacy-policy', function (req, res) {
	res.render('privacy-policy');
});

router.get('/calendar', function (req, res) {
	res.render('calendar');
});

router.get('/officers', function (req, res) {
	var sqlQuery = 'SELECT name, officerRole, bio, profilePic FROM tbl_officer';

	var sqlReq = new sql.Request()
		.query(sqlQuery)
		.then((result) => {
			res.render('officers', { officers: result.recordset });
		})
		.catch((err) => {
			req.flash('error', 'Error loading officers');
		});
});

function getOfficers(req, res) {
	var sqlQuery = 'SELECT * FROM tbl_officer';

	var sqlReq = new sql.Request()
		.query(sqlQuery)
		.then((result) => {
			res.render('officer-portal', { officers: result.recordset });
		})
		.catch((err) => {
			res.render('index');
			req.flash('error', 'Error loading officers');
		});
}

router.get('/portal/officer/:id?', getOfficers);
router.get('/portal/officer/create', getOfficers);

router.post('/portal/officer/create', function (req, res) {
	console.log(req);
	const name = req.body.officerName;
	const role = req.body.officerRole;
	const description = req.body.officerDescription;

	var sqlQuery = `INSERT INTO tbl_officer (name, officerRole, bio, profilePic, id) 
					VALUES ('${name}', '${role}', '${description}', ' ', (SELECT MAX(id) FROM tbl_officer) + 1)`;

	var sqlReq = new sql.Request()
		.query(sqlQuery)
		.then((result) => {
			getOfficers(req, res);
		})
		.catch((err) => {
			req.flash('error', 'Error creating officer');
		});
});

router.post(
	'/portal/officer/:id',
	upload.single('officerProfileImage'),
	function (req, res) {
		const name = req.body.officerName;
		const role = req.body.officerRole;
		const description = req.body.officerDescription;
		const profPic = req.file === undefined ? undefined : req.file.path;

		var sqlQuery;
		if (profPic)
			sqlQuery = `UPDATE tbl_officer SET name = '${name}', officerRole = '${role}', bio = '${description}', profilePic = '${profPic}' 
					WHERE id=${req.params['id']}`;
		else
			sqlQuery = `UPDATE tbl_officer SET name = '${name}', officerRole = '${role}', bio = '${description}' 
					WHERE id=${req.params['id']}`;

		var sqlReq = new sql.Request()
			.query(sqlQuery)
			.then((result) => {
				getOfficers(req, res);
			})
			.catch((err) => {
				req.flash('error', 'Error loading officers');
			});
	}
);

router.post('/portal/officer/delete/:id', function (req, res) {
	// console.log(`DELETING ${req.params['id']}`);

	var sqlQuery = `DELETE FROM tbl_officer WHERE id=${req.params['id']};`;

	var sqlReq = new sql.Request()
		.query(sqlQuery)
		.then((result) => {
			getOfficers(req, res);
		})
		.catch((err) => {
			req.flash('error', 'Error creating officer');
		});
});

// router.get('/newsletter', function (req, res) {
// 	res.render('newsletter');
// });

router.get('/weekly-meeting-page', async (req, res) => {
	try {
		var sqlQuery = `SELECT * FROM tbl_event`;

		var events, event_types, meeting;
		await new sql.Request()
			.query(sqlQuery)
			.then((result) => {
				events = result.recordset;
			})
			.catch((err) => {
				req.flash('error', 'Error getting meetings and events');
			});

		sqlQuery = `SELECT * FROM tbl_event_type`;

		await new sql.Request()
			.query(sqlQuery)
			.then((result) => {
				event_types = result.recordset;
			})
			.catch((err) => {
				req.flash('error', 'Error getting meetings and events');
			});

		sqlQuery = `SELECT * FROM tbl_meeting`;

		await new sql.Request()
			.query(sqlQuery)
			.then((result) => {
				meetings = result.recordset;
			})
			.catch((err) => {
				req.flash('error', 'Error getting meetings and events');
			});

		var sortedEvents = [];
		event_types.forEach((type) => {
			var obj = {};
			obj['type'] = type;
			obj['events'] = [];
			events.forEach((event) => {
				if (event.event_type_id === type.id) obj['events'].push(event);
			});
			sortedEvents.push(obj);
		});

		res.render('weekly-meeting-page', {
			event_map: sortedEvents,
			meetings: meetings,
		});
	} catch (err) {
		console.log(err);
		res.render('index');
	}
});

router.get('/contact-us', function (req, res) {
	res.render('contact-us');
});

router.get('/portal/contact', function (req, res) {
	var sqlQuery = 'SELECT * FROM contact_forms';

	var sqlReq = new sql.Request()
		.query(sqlQuery)
		.then((result) => {
			res.render('contact-us-back', { forms: result.recordset });
		})
		.catch((err) => {
			req.flash('error', 'Error loading contact forms');
		});
});

router.get('/portal/contact/view-form/:id', function (req, res) {
	var sqlQuery = `SELECT name, email, company, message FROM tbl_contact_form WHERE id = ${req.params.id}`;

	var sqlReq = new sql.Request().query(sqlQuery).then((result) => {
		res.status(200).json({
			status: 'success',
			data: result.recordset
		});
	}).catch((err) => {
		console.log('query failed');
		req.flash('error', 'Error loading contact forms');
	});
});

router.post('/contact-us', function (req, res) {
	try {
		var sqlReq = new sql.Request();

		sqlReq.input('name', sql.NVarChar, req.body.txtName);
		sqlReq.input('email', sql.NVarChar, req.body.txtEmail);
		sqlReq.input('company', sql.NVarChar, req.body.txtCompany);
		sqlReq.input('message', sql.NVarChar, req.body.txtMessage);

		sqlReq
			.query(
				'INSERT INTO tbl_contact_form (name, email, company, message) VALUES (@name, @email, @company, @message)'
			)
			.then(async (result) => {
				await discord.sendOfficerMessage(req.body);

				req.flash('success', "Message sent, we'll be in touch soon.");

				res.redirect('/contact-us');
			})
			.catch((err) => {
				console.error(err);

				req.flash('error', "Whoops, we we're unable send your message.");
				res.redirect('/contact-us');
			});
	} catch (err) {
		console.error(err);

		req.flash('error', "Whoops, we we're unable send your message.");
		res.redirect('/contact-us');
	}
});

router.get('/newsletter', function (req, res) {
	var sqlQuery = 'SELECT * FROM tbl_newsletter';
	var sqlReq = new sql.Request()
		.query(sqlQuery)
		.then((result) => {
			res.render('newsletter', {
				newsletters: result.recordset,
				moment: moment,
				hostname: req.hostname,
			});
		})
		.catch((err) => {
			req.flash('error', 'Error loading newsletter.');
			res.render('index', { newsletters: [] });
		});
});

router.get('/portal/newsletter', function (req, res) {
	getNewsletters(req, res);
});

function getNewsletters(req, res) {
	var sqlQuery = 'SELECT * FROM tbl_newsletter';
	var sqlReq = new sql.Request()
		.query(sqlQuery)
		.then((result) => {
			res.render('newsletter-portal', {
				newsletters: result.recordset,
				moment: moment,
				hostname: req.hostname,
			});
		})
		.catch((err) => {
			res.render('index');
			req.flash('error', 'Error loading newsletters');
		});
}

router.get('/portal/newsletter/:id?', getNewsletters);
router.get('/portal/newsletter/create', getNewsletters);

router.post(
	'/portal/newsletter/create',
	upload_newsletter.single('newsletter'),
	function (req, res) {
		const name = req.body.newsletterName;
		let link =
			req.file === undefined ? undefined : req.file.path.replace(/\\/g, '/');
		var sqlReq = new sql.Request();
		link = link.substr(7);
		sqlReq.input('name', sql.NVarChar, name);
		sqlReq.input('link', sql.NVarChar, link);

		var queryText = `INSERT INTO tbl_newsletter (name, link) VALUES (@name, @link)`;

		sqlReq
			.query(queryText)
			.then((result) => {
				res.redirect('/portal/newsletter/');
			})
			.catch((err) => {
				req.flash('error', 'Error creating newsletter');
			});
	}
);

router.delete('/portal/newsletter/delete/:id', function (req, res) {
	try {
		//get the link from db
		var selectQuery = `SELECT link from tbl_newsletter WHERE id=${req.params['id']}`;
		let link = null;
		var sqlReq = new sql.Request()
			.query(selectQuery)
			.then((result) => {
				link = result.recordset[0].link;
				var sqlQuery = `DELETE FROM tbl_newsletter WHERE id=${req.params['id']};`;
				var sqlReq = new sql.Request()
					.query(sqlQuery)
					.then((result) => {
						fs.unlinkSync(link);
						res.redirect('/portal/newsletter/');
					})
					.catch((err) => {
						req.flash('error', 'Error creating newsletter');
					});
			})
			.catch((err) => {
				req.flash('error', 'Error getting newsletter link');
			});
	} catch (error) {
		console.log(error);
		res.status(400).send();
	}
});

// router.get('/sitemap.xml', function (req, res) {
// 	res.sendFile(path.join(__dirname, '../sitemap.xml'));
// });

// router.get('/robots.txt', function (req, res) {
// 	res.sendFile(path.join(__dirname, '../robots.txt'));
// });

function getDateOrdinal(dt) {
	return (
		dt.getDate() +
		(dt.getDate() % 10 == 1 && dt.getDate() != 11
			? 'st'
			: dt.getDate() % 10 == 2 && dt.getDate() != 12
			? 'nd'
			: dt.getDate() % 10 == 3 && dt.getDate() != 13
			? 'rd'
			: 'th')
	);
}

module.exports = router;
