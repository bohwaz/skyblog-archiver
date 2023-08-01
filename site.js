var api = async (url, params) => {
	var params_str = '';

	if (typeof params == 'object' && params !== null) {
		Object.entries(params).forEach((e) => {
			params_str += e[0] + '=' + encodeURIComponent(e[1]) + '&';
		})
	}

	url = 'https://api.skyrock.com/' + url + '.json?' + params_str;
	console.log('Requesting', url);
	var r = await fetch(url);
	var j = await r.json();

	if (!r.ok) {
		throw Error(j.error ? j.error : url + ': ' + r.statusText + "\n" + JSON.stringify(j, null, "\t"));
	}

	return j;
};

var req = async (url) => {
	var r = await fetch(url);
	return await r.text();
};

var reqBlob = async (url) => {
	throw Error('Nope, no proxy');

	// FIXME: i.skyrock.net/wir.skyrock.net don't have CORS to allow everyone to request,
	// so we need to use a local proxy
	url = url.replace(/https:\/\//, '/');
	var r = await fetch(url);

	if (!r.ok) {
		throw Error(r.statusText);
	}

	return await r.blob();
};

function tpl(id, vars) {
	var out = document.getElementById(id).innerHTML;

	Object.entries(vars).forEach((e) => {
		var r = new RegExp('#' + e[0] + '#', 'g');
		out = out.replace(r, e[1]);
	});

	return out;
}

const imageUrlToBase64 = async url => {
	const response = await fetch(url);
	const blob = await response.blob();
	return new Promise((onSuccess, onError) => {
		try {
			const reader = new FileReader() ;
			reader.onload = function(){ onSuccess(this.result) } ;
			reader.readAsDataURL(blob) ;
		} catch(e) {
			onError(e);
		}
	});
};

function date_format(ts)
{
	var d = new Date(ts*1000);
	return d.toLocaleDateString('fr-FR', {'timezone': 'Europe/Paris'});
}

const arrayReverseObj =
  obj => Object.keys(obj).sort().reverse().map(key=> ({...obj[key],key:key}) );

var zip = new JSZip();

async function archive(username)
{
	try {
		var blog = await api('v2/blog/get', {username});
	}
	catch (e) {
		alert('Blog introuvable' + "\n" + e);
	}

	if (!blog.nb_posts) {
		alert('Ce blog n\'a aucun article.');
		return;
	}

	var images = [];
	var posts = [];
	var html = `<!doctype html>
	<html lang="fr">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">
		<meta http-equiv="X-UA-Compatible" content="ie=edge">
		<title>Blog de ${username}</title>
		<link rel="stylesheet" type="text/css" media="screen" href="css/common.css" />
		<link rel="stylesheet" type="text/css" media="screen" href="css/tpl.css" />
		<link rel="stylesheet" type="text/css" media="screen" href="css/theme.css" />
	</head>
	<body class="v5 l_fr_FR consult sidebar_two content_slim submenu_container" id="blog">
	<div id="global" class="skyrock">
		<div id="wrapper" class="container clearfix blog">
			<div id="barleft">
				<ul id="switchitem">
					<li id="currentbp" class="fullwidth donot-getstyle">
						<a title="Blog" href="#" itemprop="url">Blog</a>
					</li>
				</ul>
				<div class="sidebar" id="sidebar-left">
					<div id="blogwhois" class="sidebar-info-bloc">`;

	html += tpl('sidebar_left', {title: blog.title, username, description: blog.description});

	html += `
				</div>
			</div>
		</div>
		<div id="barright">
			<div class="sidebar" id="sidebar-right">`;

	html += tpl('sidebar_right', {
		'date_created': date_format(blog.created_at),
		'date_updated': date_format(blog.updated_at),
		'nb_posts': blog.nb_posts,
		'nb_comments': blog.nb_comments,
		'nb_friends': blog.nb_friends,
		'nb_visits': blog.nb_visits,
	});

	html += `
			</div>
		</div>
		<div id="blogcontent" class="submenu_container clearfix">
			<div id="articles_container" class="clearfix">`;

	zip.file('css/common.css', await req('https://static.skyrock.net/css/common.css'));
	zip.file('css/tpl.css', await req('https://static.skyrock.net/css/blogs/tpl.css'));
	zip.file('css/theme.css', await req('https://static.skyrock.net/css/blogs/' + blog.id_skin + '.css'));

	zip.file('json/blog.json', JSON.stringify(blog, null, "\t"));

	document.getElementById('progress').style.display = 'block';
	document.querySelector('form').style.display = 'none';
	document.getElementById('posts').max = blog.nb_posts;
	document.getElementById('posts').value = 0;

	if (blog.avatar_url) {
		images['avatar.png'] = blog.avatar_url;
	}

	var last_page = Math.ceil(blog.nb_posts / 10);

	for (var p = 1; p <= last_page; p++) {
		var posts_html = await api('v2/blog/list_posts', {username, 'page': p});
		var posts_bbcode = await api('v2/blog/list_posts', {username, 'page': p, 'output_format': 'bbcode'});

		// Reverse order
		posts_html = arrayReverseObj(posts_html.posts);

		for (var k in posts_html) {
			var post = posts_html[k];
			var id_post = post.id_post;
			post.text_bbcode = posts_bbcode.posts[id_post].text;
			post.title_bbcode = posts_bbcode.posts[id_post].title;
			post.medias = await api('v2/blog/list_post_medias', {username, 'id_post': id_post});
			post.comments = [];
			post.image = null;

			Object.values(post.medias).forEach((media) => {
				if (media.media_type != 'image') {
					console.log('Dismiss media', media);
					return;
				}

				var url = media.media_url.replace(/_small/, '');
				var ext = media.media_url.match(/\.(jpe?g|png|gif)/)[1] ?? 'img';
				images[id_post + '.' + ext] = url;
				post.image = id_post + '.' + ext;
			});

			var thumb = '';
			var align = post.media_align.match(/left|right|center/)[0] ?? 'center';

			if (post.image && post.media_align) {
				// Image
				thumb = '<div class="image-container ' + align + '"><img src="images/' + post.image + '" alt="" style="max-width: 600px; max-height: 800px;" /></div>';
			}
			else if (post.medias.length > 0) {
				// Videos, etc.
				thumb = '<div class="image-container ' + align + '">' + post.medias[0].media_html + '</div>';
			}

			var comments = '';

			if (post.nb_comments && blog.comments_enabled) {
				var last_comment_page = 1;

				comments += `
					<div class="article_content_menu clearfix donot-getstyle">
						<ul>
							<li><span class="title_tooltip">Commentaires<span class="pointe_border"></span></span></li>
						</ul>
					</div>
					<div id="secondary_content" class="clear_bloc clearfix">
						<div id="blogcomments">
							<div>`;

				for (var cp = 1; cp <= last_comment_page; cp++) {
					try {
						var post_comments = await api('v2/blog/list_post_comments', {username, 'id_post': id_post, 'page': cp});
					}
					catch (e) {
						break;
					}

					last_comment_page = post_comments.max_page;

					for (var id_comment in post_comments.comments) {
						if (!post_comments.comments.hasOwnProperty(id_comment)) {
							continue;
						}

						var comment = post_comments.comments[id_comment];
						post.comments.push(comment);
						comments += tpl('comment', {
							'username': comment.author.username,
							'date': date_format(comment.date),
							'comment': comment.content
						});
					}

				}

				comments += `
						</div>
					</div>
				</div>`;
			}

			html += tpl('post', {
				'title': post.title,
				'text': post.text,
				'class': post.medias.length == 0 ? 'isText' : 'hasimage',
				'thumbnail': thumb,
				'created_at': date_format(post.created_at),
				'updated_at': date_format(post.updated_at),
				comments
			});

			posts.push(post);
			zip.file('json/post_' + id_post + '.json', JSON.stringify(post, null, "\t"));
			document.getElementById('posts').value++;
		}
	}

	document.getElementById('images').max = Object.keys(images).length;

	html += `
			</div>
		</div>
	</div>
	</body>
	</html>`;

	zip.file('index.html', html);

	for (var path in images) {
		document.getElementById('images').value++;
		console.log('Zipping', path, 'from', images[path]);

		try {
			var blob = await reqBlob(images[path]);
			zip.file('images/' + path, blob);
		}
		catch (e) {
			console.error(e);
		}
	}

	// Save ZIP
	zip.generateAsync({type: "blob"}).then(function (blob) {
		var temp_object_url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.style.display = 'none';
		a.href = temp_object_url;
		a.download = username + '.zip';

		document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(temp_object_url);
		a.remove();

	}, function (err) {
		alert(err);
	});

	document.getElementById('progress').style.display = 'none';
	document.getElementById('finished').style.display = 'block';
}

window.onload = () => {
	document.querySelector('form').onsubmit = () => {
		var username = document.getElementById('f_username').value.replace(/\s+/, '');

		if (!username) {
			alert('Pseudo vide !');
			return;
		}

		archive(username);
		return false;
	};
};