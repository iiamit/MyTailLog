package com.mytaillog.app

import android.net.Uri
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.navigation.compose.composable

const val BOOKS_ENTRY = "logbooks/entry"
const val BOOKS_EDIT = "logbooks/edit"
const val BOOKS_BOOK = "logbooks/book"
const val BOOKS_PAGE = "logbooks/page"
const val BOOKS_REVIEW = "logbooks/review"

fun booksNav(nav: NavHostController) = BooksNav(
    openEntry = { nav.navigate("$BOOKS_ENTRY/$it") },
    editEntry = { nav.navigate("$BOOKS_EDIT/$it") },
    openReview = { nav.navigate(if (it == null) BOOKS_REVIEW else "$BOOKS_REVIEW?page=${Uri.encode(it)}") },
    openBook = { nav.navigate("$BOOKS_BOOK/$it") },
    openPage = { nav.navigate("$BOOKS_PAGE/$it") },
    back = { nav.popBackStack() },
)

/** The Logbooks tab's pushed screens (06 §6). */
fun NavGraphBuilder.booksRoutes(nav: NavHostController, vm: BooksViewModel, wide: Boolean = false) {
    val to = booksNav(nav)
    composable("$BOOKS_ENTRY/{id}") { EntryScreen(vm, it.arguments?.getString("id") ?: "", to) }
    composable("$BOOKS_EDIT/{id}") { EditEntryScreen(vm, it.arguments?.getString("id") ?: "", to) }
    composable("$BOOKS_BOOK/{id}") { BookPagesScreen(vm, it.arguments?.getString("id") ?: "", to) }
    composable("$BOOKS_PAGE/{id}") { PageScreen(vm, it.arguments?.getString("id") ?: "", to) }
    composable("$BOOKS_REVIEW?page={page}", listOf(navArgument("page") { type = NavType.StringType; nullable = true; defaultValue = null })) { ReviewScreen(vm, it.arguments?.getString("page"), to, wide) }
}
