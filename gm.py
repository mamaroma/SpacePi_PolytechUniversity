#!/usr/bin/env python3
# -*- coding: utf-8 -*-

#
# SPDX-License-Identifier: GPL-3.0
#
# GNU Radio Python Flow Graph
# Title: Not titled yet
# GNU Radio version: 3.10.10.0

from PyQt5 import Qt
from gnuradio import qtgui
from gnuradio import blocks
import math
import pmt
from gnuradio import filter
from gnuradio.filter import firdes
from gnuradio import gr
from gnuradio.fft import window
import sys
import signal
from PyQt5 import Qt
from argparse import ArgumentParser
from gnuradio.eng_arg import eng_float, intx
from gnuradio import eng_notation
import gnuradio.lora_sdr as lora_sdr



class gm(gr.top_block, Qt.QWidget):

    def __init__(self):
        gr.top_block.__init__(self, "Not titled yet", catch_exceptions=True)
        Qt.QWidget.__init__(self)
        self.setWindowTitle("Not titled yet")
        qtgui.util.check_set_qss()
        try:
            self.setWindowIcon(Qt.QIcon.fromTheme('gnuradio-grc'))
        except BaseException as exc:
            print(f"Qt GUI: Could not set Icon: {str(exc)}", file=sys.stderr)
        self.top_scroll_layout = Qt.QVBoxLayout()
        self.setLayout(self.top_scroll_layout)
        self.top_scroll = Qt.QScrollArea()
        self.top_scroll.setFrameStyle(Qt.QFrame.NoFrame)
        self.top_scroll_layout.addWidget(self.top_scroll)
        self.top_scroll.setWidgetResizable(True)
        self.top_widget = Qt.QWidget()
        self.top_scroll.setWidget(self.top_widget)
        self.top_layout = Qt.QVBoxLayout(self.top_widget)
        self.top_grid_layout = Qt.QGridLayout()
        self.top_layout.addLayout(self.top_grid_layout)

        self.settings = Qt.QSettings("GNU Radio", "gm")

        try:
            geometry = self.settings.value("geometry")
            if geometry:
                self.restoreGeometry(geometry)
        except BaseException as exc:
            print(f"Qt GUI: Could not restore geometry: {str(exc)}", file=sys.stderr)

        ##################################################
        # Blocks
        ##################################################

        self.rational_resampler_xxx_0 = filter.rational_resampler_ccc(
                interpolation=1, # НАДО ЗАДАВАТЬ interpolation
                decimation=40, # НАДО ЗАДАВАТЬ decimation
                taps=[],
                fractional_bw=0)
        self.low_pass_filter_0 = filter.fir_filter_ccf(
            1,
            firdes.low_pass(
                1,
                250e3, # НАДО ЗАДАВАТЬ sample rate
                35000, # НАДО ЗАДАВАТЬ cutoff freq
                10000, # НАДО ЗАДАВАТЬ transition width
                window.WIN_HAMMING,
                6.76))
        self.lora_sdr_header_decoder_0 = lora_sdr.header_decoder(False, 2, 62, True, 2, True)
        self.lora_sdr_hamming_dec_0 = lora_sdr.hamming_dec(True)
        self.lora_sdr_gray_mapping_0 = lora_sdr.gray_mapping( True)
        self.lora_sdr_frame_sync_0 = lora_sdr.frame_sync(437845000, 62500, 8, False, [18], 4,8) # НАДО ЗАДАВАТЬ center_freq, bandwidth, SF, ...False - ВСЕГДА FALSE..., sync_word, os_factor, preamble_len
        self.lora_sdr_fft_demod_0 = lora_sdr.fft_demod( True, True)
        self.lora_sdr_dewhitening_0 = lora_sdr.dewhitening()
        self.lora_sdr_deinterleaver_0 = lora_sdr.deinterleaver( True)
        self.lora_sdr_crc_verif_0 = lora_sdr.crc_verif( 0, False)
        self.blocks_freqshift_cc_0 = blocks.rotator_cc(2.0*math.pi*60e3/250e3) # НАДО ЗАДАВАТЬ 250e3 - sample rate, 60e3 - freq shift
        self.blocks_file_source_0 = blocks.file_source(gr.sizeof_gr_complex*1, 'raw.iq', False, 0, 0)
        self.blocks_file_source_0.set_begin_tag(pmt.PMT_NIL)
        self.blocks_file_sink_0_1 = blocks.file_sink(gr.sizeof_char*1, 'data.bin', False)
        self.blocks_file_sink_0_1.set_unbuffered(False)


        ##################################################
        # Connections
        ##################################################
        self.msg_connect((self.lora_sdr_header_decoder_0, 'frame_info'), (self.lora_sdr_frame_sync_0, 'frame_info'))
        self.connect((self.blocks_file_source_0, 0), (self.rational_resampler_xxx_0, 0))
        self.connect((self.blocks_freqshift_cc_0, 0), (self.low_pass_filter_0, 0))
        self.connect((self.lora_sdr_crc_verif_0, 0), (self.blocks_file_sink_0_1, 0))
        self.connect((self.lora_sdr_deinterleaver_0, 0), (self.lora_sdr_hamming_dec_0, 0))
        self.connect((self.lora_sdr_dewhitening_0, 0), (self.lora_sdr_crc_verif_0, 0))
        self.connect((self.lora_sdr_fft_demod_0, 0), (self.lora_sdr_gray_mapping_0, 0))
        self.connect((self.lora_sdr_frame_sync_0, 0), (self.lora_sdr_fft_demod_0, 0))
        self.connect((self.lora_sdr_gray_mapping_0, 0), (self.lora_sdr_deinterleaver_0, 0))
        self.connect((self.lora_sdr_hamming_dec_0, 0), (self.lora_sdr_header_decoder_0, 0))
        self.connect((self.lora_sdr_header_decoder_0, 0), (self.lora_sdr_dewhitening_0, 0))
        self.connect((self.low_pass_filter_0, 0), (self.lora_sdr_frame_sync_0, 0))
        self.connect((self.rational_resampler_xxx_0, 0), (self.blocks_freqshift_cc_0, 0))


    def closeEvent(self, event):
        self.settings = Qt.QSettings("GNU Radio", "gm")
        self.settings.setValue("geometry", self.saveGeometry())
        self.stop()
        self.wait()

        event.accept()




def main(top_block_cls=gm, options=None):

    qapp = Qt.QApplication(sys.argv)

    tb = top_block_cls()

    tb.start()

    tb.show()

    def sig_handler(sig=None, frame=None):
        tb.stop()
        tb.wait()

        Qt.QApplication.quit()

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    timer = Qt.QTimer()
    timer.start(500)
    timer.timeout.connect(lambda: None)

    qapp.exec_()

if __name__ == '__main__':
    main()
