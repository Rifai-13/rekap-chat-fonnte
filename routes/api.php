<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\WebhookController;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::post('/webhook', [WebhookController::class, 'handle']);
Route::post('/send-message', [WebhookController::class, 'sendMessage']);
Route::post('/ai/sync-knowledge', [WebhookController::class, 'crawlWebsite']);
Route::get('/ai/list-models', [WebhookController::class, 'listModels']);
Route::post('/webhook/status', [App\Http\Controllers\WebhookController::class, 'handleStatus']);
Route::delete('/ai/knowledge/{id}', [App\Http\Controllers\WebhookController::class, 'deleteKnowledge']);