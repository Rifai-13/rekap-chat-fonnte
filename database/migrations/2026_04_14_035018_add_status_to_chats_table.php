<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('chats', function (Blueprint $table) {
            //
            // id_fonnte untuk mencocokkan laporan dari Fonnte ke database kita
            $table->string('id_fonnte')->nullable()->after('id');
            // status untuk menyimpan sent, delivered, atau read
            $table->string('status')->default('sent')->after('is_from_me');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('chats', function (Blueprint $table) {
            //
        });
    }
};